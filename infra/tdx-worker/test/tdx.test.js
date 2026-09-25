import { describe, expect, it } from "vitest";
import { requestToken, fetchTdxPages, withOneAuthRefresh } from "../src/tdx.js";
import { AppError } from "../src/errors.js";

const env={
  TDX_CLIENT_ID:"client",
  TDX_CLIENT_SECRET:"secret",
  TDX_TIMEOUT_MS:"1000",
  MAX_UPSTREAM_BYTES:"2097152"
};

describe("TDX OAuth", () => {
  it("uses client credentials form body and actual expires_in", async () => {
    let captured;
    const result=await requestToken(env, async (url, options) => {
      captured={url,options};
      return Response.json({access_token:"abc",expires_in:7200});
    });
    expect(result).toEqual({token:"abc",expiresIn:7200});
    expect(captured.options.method).toBe("POST");
    expect(captured.options.body.get("grant_type")).toBe("client_credentials");
    expect(captured.options.body.get("client_id")).toBe("client");
    expect(captured.options.body.get("client_secret")).toBe("secret");
  });

  it("does not accept missing credentials", async () => {
    await expect(requestToken({}, async()=>Response.json({}))).rejects.toMatchObject({code:"UPSTREAM_AUTH_FAILED"});
  });

  it("maps token HTTP failure to auth failure", async () => {
    await expect(requestToken(env, async()=>new Response("no",{status:401}))).rejects.toMatchObject({code:"UPSTREAM_AUTH_FAILED"});
  });
});

describe("TDX data client", () => {
  it("fetches JSON, reserves budget before request, and records bytes", async () => {
    let before=0,bytes=0;
    const out=await fetchTdxPages({
      env,token:"t",path:"/v2/Road/Traffic/Live/Freeway",
      beforeRequest:()=>before++,
      onUsage:(x)=>bytes+=x.bytes,
      fetchImpl:async()=>Response.json([{SectionID:"A",DataCollectTime:"2026-09-25T01:00:00+08:00"}])
    });
    expect(before).toBe(1);
    expect(bytes).toBeGreaterThan(0);
    expect(out.items).toHaveLength(1);
    expect(out.sourceUpdatedAt).toBe("2026-09-25T01:00:00+08:00");
  });

  it("paginates until the first short page", async () => {
    let call=0,before=0;
    const first=Array.from({length:1000},(_,i)=>({id:i}));
    const out=await fetchTdxPages({
      env,token:"t",path:"/v1/Parking/OffStreet/CarPark/City/Taipei",
      beforeRequest:()=>before++,
      fetchImpl:async()=>{
        call++;
        return Response.json(call===1?first:[{id:1000}]);
      }
    });
    expect(call).toBe(2);
    expect(before).toBe(2);
    expect(out.items).toHaveLength(1001);
  });

  it("signals one token refresh on 401", async () => {
    await expect(fetchTdxPages({
      env,token:"bad",path:"/v2/Road/Traffic/Live/Freeway",
      fetchImpl:async()=>new Response("unauthorized",{status:401})
    })).rejects.toMatchObject({code:"UPSTREAM_AUTH_FAILED",extra:{refreshToken:true}});
  });

  it("turns 429 into cooldown-aware upstream failure", async () => {
    await expect(fetchTdxPages({
      env,token:"t",path:"/v2/Road/Traffic/Live/Freeway",
      fetchImpl:async()=>new Response("limited",{status:429,headers:{"retry-after":"75"}})
    })).rejects.toMatchObject({code:"UPSTREAM_UNAVAILABLE",extra:{cooldown:true,retryAfterSeconds:75}});
  });

  it("turns 5xx into unavailable", async () => {
    await expect(fetchTdxPages({
      env,token:"t",path:"/v2/Road/Traffic/Live/Freeway",
      fetchImpl:async()=>new Response("bad",{status:503})
    })).rejects.toMatchObject({code:"UPSTREAM_UNAVAILABLE"});
  });

  it("turns fetch failure/timeout into unavailable", async () => {
    await expect(fetchTdxPages({
      env,token:"t",path:"/v2/Road/Traffic/Live/Freeway",
      fetchImpl:async()=>{throw new Error("network");}
    })).rejects.toMatchObject({code:"UPSTREAM_UNAVAILABLE"});
  });

  it("rejects unknown JSON containers instead of treating them as empty live data", async () => {
    await expect(fetchTdxPages({
      env,token:"t",path:"/v2/Road/Traffic/Live/Freeway",
      fetchImpl:async()=>Response.json({unexpected:"shape"})
    })).rejects.toMatchObject({code:"UPSTREAM_SCHEMA_INVALID"});
  });

  it("rejects invalid JSON instead of treating it as empty live data", async () => {
    await expect(fetchTdxPages({
      env,token:"t",path:"/v2/Road/Traffic/Live/Freeway",
      fetchImpl:async()=>new Response("<html>",{status:200})
    })).rejects.toMatchObject({code:"UPSTREAM_SCHEMA_INVALID"});
  });
});

describe("resumable pagination", () => {
  it("returns saved progress instead of discarding completed pages when the rolling budget pauses collection", async () => {
    let reservations=0;
    const pages=[];
    const result=await fetchTdxPages({
      env,token:"t",path:"/v1/Parking/OffStreet/CarPark/City/Tainan",
      yieldOnBudget:true,
      beforeRequest:()=>{
        reservations++;
        if(reservations>1) throw new AppError(503,"BUDGET_EXHAUSTED","pause",{retryAfterSeconds:60});
      },
      onPage:(page)=>pages.push(page),
      fetchImpl:async()=>Response.json(Array.from({length:1000},(_,i)=>({CarParkID:String(i)})))
    });
    expect(result).toMatchObject({complete:false,nextPage:1,retryAfterSeconds:60});
    expect(pages).toHaveLength(1);
    expect(pages[0].page).toBe(0);
    expect(pages[0].items).toHaveLength(1000);
  });
});

describe("single auth refresh policy", () => {
  it("refreshes once after a token rejection", async () => {
    const tokens=[];
    let calls=0;
    const result=await withOneAuthRefresh({
      getToken: async(force)=>{tokens.push(force); return force?"fresh":"old";},
      request: async(token)=>{
        calls++;
        if(token==="old") {
          const error=new Error("401");
          error.name="AppError";
          Object.setPrototypeOf(error, (await import("../src/errors.js")).AppError.prototype);
          error.extra={refreshToken:true};
          throw error;
        }
        return "ok";
      }
    });
    expect(result).toBe("ok");
    expect(tokens).toEqual([false,true]);
    expect(calls).toBe(2);
  });

  it("does not loop if refreshed token is also rejected", async () => {
    let calls=0;
    await expect(withOneAuthRefresh({
      getToken: async(force)=>force?"fresh":"old",
      request: async()=>{
        calls++;
        const {AppError}=await import("../src/errors.js");
        throw new AppError(503,"UPSTREAM_AUTH_FAILED","bad",{refreshToken:true});
      }
    })).rejects.toMatchObject({code:"UPSTREAM_AUTH_FAILED"});
    expect(calls).toBe(2);
  });
});
