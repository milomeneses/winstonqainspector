import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getAssetKind, safeAssetName, type Review } from "@/lib/review-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ROOT = path.join(process.cwd(), "data", "reviews");
const MAX_FILE = 100 * 1024 * 1024;
const MAX_TOTAL = 250 * 1024 * 1024;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_TOTAL + 2 * 1024 * 1024) return NextResponse.json({ error: "This batch exceeds the 250 MB combined upload limit." }, { status: 413 });
  const { id } = await context.params;
  if (!/^[a-f0-9]{24}$/.test(id)) return NextResponse.json({error:"Review not found."},{status:404});
  const reviewPath = path.join(ROOT,id,"review.json");
  let review: Review;
  try { review = JSON.parse(await readFile(reviewPath,"utf8")) as Review; }
  catch { return NextResponse.json({error:"Review not found."},{status:404}); }
  try {
    const form = await request.formData();
    const files = form.getAll("files").filter((value):value is File=>value instanceof File&&value.size>0);
    if (!files.length) return NextResponse.json({error:"Choose at least one file."},{status:400});
    let total=0;
    for(const file of files){total+=file.size;if(file.size>MAX_FILE)return NextResponse.json({error:file.name+" is over the 100 MB per-file limit."},{status:413});}
    if(total>MAX_TOTAL)return NextResponse.json({error:"This batch exceeds the 250 MB combined limit."},{status:413});
    const uploadDir=path.join(ROOT,id,"files");
    await mkdir(uploadDir,{recursive:true});
    const assets=[];
    for(const file of files){
      const assetId=randomUUID().replaceAll("-","").slice(0,16);
      const originalName=safeAssetName(file.name);
      const extension=originalName.split(".").pop()?.toLowerCase()||"";
      const storedName=assetId+"-"+originalName;
      await writeFile(path.join(uploadDir,storedName),Buffer.from(await file.arrayBuffer()),{flag:"wx"});
      assets.push({id:assetId,originalName,storedName,mimeType:file.type||"application/octet-stream",extension,kind:getAssetKind(originalName,file.type),size:file.size,uploadedAt:new Date().toISOString(),note:"",status:"needs-review" as const,qaResults:[],strokes:[],timeNotes:[],fileUrl:"/api/reviews/"+id+"/files/"+assetId});
    }
    review.assets.push(...assets);review.updatedAt=new Date().toISOString();
    await writeFile(reviewPath,JSON.stringify(review,null,2),"utf8");
    return NextResponse.json({assets},{status:201});
  } catch {
    return NextResponse.json({error:"Could not add these files. Check upload size and available storage."},{status:500});
  }
}
