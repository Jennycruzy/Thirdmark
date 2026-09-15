import { randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import {
  ecMulGenerator,
  jubjubPointX,
  jubjubPointY,
} from "@midnight-ntwrk/compact-runtime";

const modulus =
  0xe7db4ea6533afa906673b0101343b00a6682093ccc81082d0970e5ed6f72cb7n;
const home = process.env.HOME;
if (!home) throw new Error("HOME is required");

let scalar;
do {
  scalar = BigInt(`0x${randomBytes(32).toString("hex")}`);
} while (scalar === 0n || scalar >= modulus);

const secretDirectory = `${home}/thirdmark/secrets`;
const secretPath = `${secretDirectory}/issuer.scalar`;
const publicPath = `${secretDirectory}/issuer.public.json`;
mkdirSync(secretDirectory, { recursive: true, mode: 0o700 });
writeFileSync(secretPath, `${scalar.toString(16)}\n`, { mode: 0o600 });
chmodSync(secretPath, 0o600);

const point = ecMulGenerator(scalar);
const publicPoint = {
  x: jubjubPointX(point).toString(10),
  y: jubjubPointY(point).toString(10),
};
writeFileSync(publicPath, `${JSON.stringify(publicPoint)}\n`, { mode: 0o644 });
process.stdout.write(JSON.stringify(publicPoint));
