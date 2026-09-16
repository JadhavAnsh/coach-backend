import { describe,expect,test } from "bun:test";
import { CreateSession, Metric, Report, summarize } from "../src/contracts/coaching";
describe("coaching contracts",()=>{
 test("silence has no fabricated pitch or speaking rate",()=>{const s=summarize(10,[],[]);expect(s.pitchVariation).toBeNull();expect(s.speakingWpm).toBeNull();expect(s.overallWpm).toBe(0);});
 test("partial transcripts do not claim complete metrics",()=>{expect(summarize(10,[],[],false).fillerCount).toBeNull();});
 test("rejects invalid metrics and unbounded output",()=>{expect(Metric.safeParse({second:0}).success).toBe(false);expect(Report.safeParse({observations:[],strengths:[],improvements:Array(4).fill({text:"x",evidenceSeconds:[0]})}).success).toBe(false);});
 test("counts disfluencies without treating like as a filler",()=>{const s=summarize(60,[],[{segmentId:"a",start:0,end:3,text:"um like this",words:["um","like","this"].map((word,i)=>({word,start:i,end:i+1,confidence:1}))}]);expect(s.fillerCount).toBe(1);expect(s.overallWpm).toBe(3);});
});
