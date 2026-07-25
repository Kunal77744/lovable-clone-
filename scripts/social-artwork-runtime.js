const challengeArtworkPath = "/wildvault-challenge-preview.png";
let decodedSocialImagePromise;

function concatenateBytes(parts) {
  const length = parts.reduce((total, part) => total + part.byteLength, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

async function transformCompression(bytes, format, kind) {
  const stream =
    kind === "compress"
      ? new CompressionStream(format)
      : new DecompressionStream(format);
  const writer = stream.writable.getWriter();
  const writing = writer.write(bytes).then(() => writer.close());
  const output = new Uint8Array(await new Response(stream.readable).arrayBuffer());
  await writing;
  return output;
}

function paethPredictor(left, up, upperLeft) {
  const prediction = left + up - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const upDistance = Math.abs(prediction - up);
  const upperLeftDistance = Math.abs(prediction - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  if (upDistance <= upperLeftDistance) return up;
  return upperLeft;
}

async function decodeSocialPng() {
  const view = new DataView(
    socialImage.buffer,
    socialImage.byteOffset,
    socialImage.byteLength,
  );
  let offset = 8;
  let width;
  let height;
  const idatParts = [];

  while (offset < socialImage.byteLength) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(
      socialImage[offset + 4],
      socialImage[offset + 5],
      socialImage[offset + 6],
      socialImage[offset + 7],
    );
    const dataStart = offset + 8;
    if (type === "IHDR") {
      width = view.getUint32(dataStart);
      height = view.getUint32(dataStart + 4);
      if (
        socialImage[dataStart + 8] !== 8 ||
        socialImage[dataStart + 9] !== 2
      ) {
        throw new Error("Unsupported social image format");
      }
    } else if (type === "IDAT") {
      idatParts.push(socialImage.slice(dataStart, dataStart + length));
    }
    offset = dataStart + length + 4;
  }

  if (!width || !height || idatParts.length === 0) {
    throw new Error("Invalid social image");
  }

  const filtered = await transformCompression(
    concatenateBytes(idatParts),
    "deflate",
    "decompress",
  );
  const bytesPerPixel = 3;
  const rowLength = width * bytesPerPixel;
  const pixels = new Uint8Array(width * height * bytesPerPixel);
  let sourceOffset = 0;

  for (let row = 0; row < height; row += 1) {
    const filter = filtered[sourceOffset];
    sourceOffset += 1;
    const rowOffset = row * rowLength;
    for (let column = 0; column < rowLength; column += 1) {
      const raw = filtered[sourceOffset + column];
      const left =
        column >= bytesPerPixel ? pixels[rowOffset + column - bytesPerPixel] : 0;
      const up = row > 0 ? pixels[rowOffset + column - rowLength] : 0;
      const upperLeft =
        row > 0 && column >= bytesPerPixel
          ? pixels[rowOffset + column - rowLength - bytesPerPixel]
          : 0;
      let value = raw;
      if (filter === 1) value = raw + left;
      else if (filter === 2) value = raw + up;
      else if (filter === 3) value = raw + Math.floor((left + up) / 2);
      else if (filter === 4) value = raw + paethPredictor(left, up, upperLeft);
      else if (filter !== 0) throw new Error("Unsupported PNG filter");
      pixels[rowOffset + column] = value & 255;
    }
    sourceOffset += rowLength;
  }

  return { width, height, pixels };
}

function blendPixel(image, x, y, color, alpha = 1) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  const offset = (y * image.width + x) * 3;
  for (let channel = 0; channel < 3; channel += 1) {
    image.pixels[offset + channel] = Math.round(
      image.pixels[offset + channel] * (1 - alpha) + color[channel] * alpha,
    );
  }
}

function insideRoundedRectangle(x, y, width, height, radius) {
  const left = x < radius;
  const right = x >= width - radius;
  const top = y < radius;
  const bottom = y >= height - radius;
  if ((!left && !right) || (!top && !bottom)) return true;
  const centerX = left ? radius : width - radius - 1;
  const centerY = top ? radius : height - radius - 1;
  const deltaX = x - centerX;
  const deltaY = y - centerY;
  return deltaX * deltaX + deltaY * deltaY <= radius * radius;
}

function fillRoundedRectangle(image, x, y, width, height, radius, color, alpha) {
  for (let localY = 0; localY < height; localY += 1) {
    for (let localX = 0; localX < width; localX += 1) {
      if (insideRoundedRectangle(localX, localY, width, height, radius)) {
        blendPixel(image, x + localX, y + localY, color, alpha);
      }
    }
  }
}

function strokeRoundedRectangle(
  image,
  x,
  y,
  width,
  height,
  radius,
  thickness,
  color,
  alpha,
) {
  fillRoundedRectangle(image, x, y, width, height, radius, color, alpha);
  fillRoundedRectangle(
    image,
    x + thickness,
    y + thickness,
    width - thickness * 2,
    height - thickness * 2,
    Math.max(0, radius - thickness),
    [5, 13, 9],
    0.96,
  );
}

const bitmapGlyphs = {
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  ",": ["00000", "00000", "00000", "00000", "00110", "00110", "00100"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  G: ["01111", "10000", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
};

function textWidth(text, scale, letterSpacing) {
  if (!text) return 0;
  return text.length * 5 * scale + (text.length - 1) * letterSpacing;
}

function drawBitmapText(
  image,
  text,
  x,
  y,
  scale,
  letterSpacing,
  color,
  alpha = 1,
) {
  let cursor = x;
  for (const character of text) {
    const glyph = bitmapGlyphs[character] ?? bitmapGlyphs[" "];
    for (let row = 0; row < glyph.length; row += 1) {
      for (let column = 0; column < glyph[row].length; column += 1) {
        if (glyph[row][column] !== "1") continue;
        for (let pixelY = 0; pixelY < scale; pixelY += 1) {
          for (let pixelX = 0; pixelX < scale; pixelX += 1) {
            blendPixel(
              image,
              cursor + column * scale + pixelX,
              y + row * scale + pixelY,
              color,
              alpha,
            );
          }
        }
      }
    }
    cursor += 5 * scale + letterSpacing;
  }
}

function drawCenteredBitmapText(
  image,
  text,
  centerX,
  y,
  scale,
  letterSpacing,
  color,
  alpha = 1,
) {
  drawBitmapText(
    image,
    text,
    Math.round(centerX - textWidth(text, scale, letterSpacing) / 2),
    y,
    scale,
    letterSpacing,
    color,
    alpha,
  );
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Uint8Array.from(type, (character) => character.charCodeAt(0));
  const body = concatenateBytes([typeBytes, data]);
  const chunk = new Uint8Array(data.byteLength + 12);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.byteLength);
  chunk.set(body, 4);
  view.setUint32(chunk.byteLength - 4, crc32(body));
  return chunk;
}

async function encodeRgbPng(image) {
  const rowLength = image.width * 3;
  const filtered = new Uint8Array((rowLength + 1) * image.height);
  for (let row = 0; row < image.height; row += 1) {
    filtered[row * (rowLength + 1)] = 0;
    filtered.set(
      image.pixels.subarray(row * rowLength, (row + 1) * rowLength),
      row * (rowLength + 1) + 1,
    );
  }
  const compressed = await transformCompression(filtered, "deflate", "compress");
  const header = new Uint8Array(13);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, image.width);
  headerView.setUint32(4, image.height);
  header[8] = 8;
  header[9] = 2;
  const signature = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
  return concatenateBytes([
    signature,
    pngChunk("IHDR", header),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", new Uint8Array()),
  ]);
}

async function renderChallengeArtwork(preview) {
  decodedSocialImagePromise ??= decodeSocialPng();
  const decoded = await decodedSocialImagePromise;
  const image = {
    width: decoded.width,
    height: decoded.height,
    pixels: decoded.pixels.slice(),
  };
  const panel = { x: 438, y: 25, width: 564, height: 126, radius: 18 };
  strokeRoundedRectangle(
    image,
    panel.x,
    panel.y,
    panel.width,
    panel.height,
    panel.radius,
    2,
    [244, 188, 73],
    0.8,
  );
  const score = preview.distance.toLocaleString("en-US");
  const label =
    preview.kind === "daily"
      ? `${preview.date} DAILY ROUTE`
      : "RUN CHALLENGE";
  drawCenteredBitmapText(
    image,
    label,
    panel.x + panel.width / 2,
    panel.y + 22,
    3,
    4,
    [224, 199, 126],
    0.92,
  );
  drawCenteredBitmapText(
    image,
    `BEAT ${score}M`,
    panel.x + panel.width / 2,
    panel.y + 59,
    6,
    6,
    [255, 209, 102],
  );
  return encodeRgbPng(image);
}
