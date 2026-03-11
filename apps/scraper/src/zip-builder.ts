// ** import core packages
import { createReadStream, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { createGzip } from "node:zlib";
import { PassThrough, Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

// ** import types
import type { Response } from "express";

// ════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════

interface ZipEntry {
    relativePath: string;
    absolutePath: string;
    size: number;
}

// ════════════════════════════════════════════════════
// ZIP BUILDER (TAR.GZ for simplicity — no external deps)
//
// Produces a .tar.gz stream from a directory.
// Using tar+gzip because it's natively supported (no npm dep)
// and modern OS/tools all handle .tar.gz well.
// ════════════════════════════════════════════════════

/**
 * Collect all files in a directory recursively.
 */
function collectFiles(dir: string, prefix = ""): ZipEntry[] {
    const entries: ZipEntry[] = [];
    if (!existsSync(dir)) return entries;

    for (const name of readdirSync(dir)) {
        const absPath = path.join(dir, name);
        const relPath = prefix ? `${prefix}/${name}` : name;
        const stat = statSync(absPath);

        if (stat.isDirectory()) {
            entries.push(...collectFiles(absPath, relPath));
        } else if (stat.isFile()) {
            entries.push({
                relativePath: relPath,
                absolutePath: absPath,
                size: stat.size,
            });
        }
    }

    return entries;
}

/**
 * Write a tar header block for a file.
 * Simplified POSIX tar header (512 bytes).
 */
function tarHeader(filename: string, size: number): Buffer {
    const header = Buffer.alloc(512, 0);

    // Name (0–99)
    const nameBytes = Buffer.from(filename, "utf-8");
    nameBytes.copy(header, 0, 0, Math.min(nameBytes.length, 100));

    // Mode (100–107)
    header.write("0000644\0", 100, 8, "ascii");

    // UID (108–115)
    header.write("0001000\0", 108, 8, "ascii");

    // GID (116–123)
    header.write("0001000\0", 116, 8, "ascii");

    // Size (124–135) — octal
    header.write(size.toString(8).padStart(11, "0") + "\0", 124, 12, "ascii");

    // Mtime (136–147)
    const mtime = Math.floor(Date.now() / 1000);
    header.write(mtime.toString(8).padStart(11, "0") + "\0", 136, 12, "ascii");

    // Checksum placeholder (148–155): 8 spaces
    header.write("        ", 148, 8, "ascii");

    // Typeflag (156): '0' = regular file
    header.write("0", 156, 1, "ascii");

    // USTAR indicator (257–262)
    header.write("ustar\0", 257, 6, "ascii");

    // USTAR version (263–264)
    header.write("00", 263, 2, "ascii");

    // Calculate checksum
    let checksum = 0;
    for (let i = 0; i < 512; i++) {
        checksum += header[i];
    }
    header.write(checksum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");

    return header;
}

/**
 * Stream a .tar.gz archive of the given directory to an Express response.
 */
export async function streamTarGz(
    outputDir: string,
    archiveName: string,
    res: Response
): Promise<void> {
    const files = collectFiles(outputDir);

    if (files.length === 0) {
        res.status(404).json({ error: "No output files found" });
        return;
    }

    res.setHeader("Content-Type", "application/gzip");
    res.setHeader(
        "Content-Disposition",
        `attachment; filename="${archiveName}.tar.gz"`
    );

    const tarStream = new PassThrough();
    const gzipStream = createGzip({ level: 6 });

    // Pipe tar → gzip → response
    const pipelinePromise = pipeline(tarStream, gzipStream, res);

    for (const file of files) {
        const header = tarHeader(file.relativePath, file.size);
        tarStream.write(header);

        // Write file content
        const fileStream = createReadStream(file.absolutePath);
        for await (const chunk of fileStream) {
            tarStream.write(chunk);
        }

        // Pad to 512-byte boundary
        const padding = 512 - (file.size % 512);
        if (padding < 512) {
            tarStream.write(Buffer.alloc(padding, 0));
        }
    }

    // End-of-archive marker (two 512-byte zero blocks)
    tarStream.write(Buffer.alloc(1024, 0));
    tarStream.end();

    await pipelinePromise;
}
