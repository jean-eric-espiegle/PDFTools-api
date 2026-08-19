import archiver from "archiver";
import { PassThrough } from "node:stream";

export async function zipFiles(files: { name: string; buffer: Buffer }[]): Promise<Buffer> {
  const archive = archiver("zip", { zlib: { level: 9 } });
  const output = new PassThrough();
  const chunks: Buffer[] = [];

  output.on("data", (chunk) => chunks.push(chunk));
  archive.pipe(output);

  for (const file of files) {
    archive.append(file.buffer, { name: file.name });
  }

  const done = archive.finalize();
  await new Promise<void>((resolve, reject) => {
    output.on("end", resolve);
    archive.on("error", reject);
  });
  await done;

  return Buffer.concat(chunks);
}
