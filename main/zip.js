// 简单 ZIP 打包器：纯 Node 实现，不引入新依赖
// 仅支持 store / deflate，UTF-8 文件名，足够导出用户数据
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// CRC32 表
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosTime(d) {
  const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() / 2) & 0x1f);
  const date = (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0xf) << 5) | (d.getDate() & 0x1f);
  return { time, date };
}

// 创建一个 zip 写入器，可向其追加文件，最后返回 buffer
function createZip() {
  const entries = [];

  function addFile(arcname, content, mtime = new Date()) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8');
    const compressed = zlib.deflateRawSync(data);
    const useCompressed = compressed.length < data.length;
    const stored = useCompressed ? compressed : data;
    entries.push({
      name: arcname,
      crc: crc32(data),
      sizeUncompressed: data.length,
      sizeCompressed: stored.length,
      method: useCompressed ? 8 : 0,
      mtime,
      data: stored,
    });
  }

  function addDir(diskDir, arcPrefix = '') {
    if (!fs.existsSync(diskDir)) return;
    for (const name of fs.readdirSync(diskDir)) {
      const full = path.join(diskDir, name);
      const arc = arcPrefix ? arcPrefix + '/' + name : name;
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        addDir(full, arc);
      } else if (stat.isFile()) {
        addFile(arc, fs.readFileSync(full), stat.mtime);
      }
    }
  }

  function build() {
    const localChunks = [];
    const central = [];
    let offset = 0;

    for (const e of entries) {
      const nameBuf = Buffer.from(e.name, 'utf-8');
      const { time, date } = dosTime(e.mtime);

      // Local file header
      const lfh = Buffer.alloc(30);
      lfh.writeUInt32LE(0x04034b50, 0);
      lfh.writeUInt16LE(20, 4);                        // version needed
      lfh.writeUInt16LE(0x0800, 6);                    // gp flag: UTF-8 names
      lfh.writeUInt16LE(e.method, 8);                  // method
      lfh.writeUInt16LE(time, 10);
      lfh.writeUInt16LE(date, 12);
      lfh.writeUInt32LE(e.crc, 14);
      lfh.writeUInt32LE(e.sizeCompressed, 18);
      lfh.writeUInt32LE(e.sizeUncompressed, 22);
      lfh.writeUInt16LE(nameBuf.length, 26);
      lfh.writeUInt16LE(0, 28);
      localChunks.push(lfh, nameBuf, e.data);

      // Central directory entry
      const cd = Buffer.alloc(46);
      cd.writeUInt32LE(0x02014b50, 0);
      cd.writeUInt16LE(20, 4);                          // version made by
      cd.writeUInt16LE(20, 6);                          // version needed
      cd.writeUInt16LE(0x0800, 8);                      // gp flag
      cd.writeUInt16LE(e.method, 10);
      cd.writeUInt16LE(time, 12);
      cd.writeUInt16LE(date, 14);
      cd.writeUInt32LE(e.crc, 16);
      cd.writeUInt32LE(e.sizeCompressed, 20);
      cd.writeUInt32LE(e.sizeUncompressed, 24);
      cd.writeUInt16LE(nameBuf.length, 28);
      cd.writeUInt16LE(0, 30);                          // extra
      cd.writeUInt16LE(0, 32);                          // comment
      cd.writeUInt16LE(0, 34);                          // disk start
      cd.writeUInt16LE(0, 36);                          // internal attrs
      cd.writeUInt32LE(0, 38);                          // external attrs
      cd.writeUInt32LE(offset, 42);                     // local header offset
      central.push(cd, nameBuf);

      offset += lfh.length + nameBuf.length + e.data.length;
    }

    const cdBuf = Buffer.concat(central);
    const cdOffset = offset;

    // EOCD
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);                           // disk #
    eocd.writeUInt16LE(0, 6);                           // disk w/ CD
    eocd.writeUInt16LE(entries.length, 8);
    eocd.writeUInt16LE(entries.length, 10);
    eocd.writeUInt32LE(cdBuf.length, 12);
    eocd.writeUInt32LE(cdOffset, 16);
    eocd.writeUInt16LE(0, 20);                          // comment len

    return Buffer.concat([...localChunks, cdBuf, eocd]);
  }

  return { addFile, addDir, build };
}

module.exports = { createZip };
