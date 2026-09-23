import http from "node:http";
import https from "node:https";

import { LcuHttpError, LcuNetworkError, LcuProtocolError } from "../errors.js";

const DEFAULT_TIMEOUT_MS = 3000;
const DEFAULT_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

function validateEndpoint(endpoint) {
  if (typeof endpoint !== "string" || !endpoint.startsWith("/") || endpoint.includes("://")) {
    throw new LcuProtocolError("LCU endpoint must be a local absolute path.");
  }
}

function parseResponseBody(buffer, contentType) {
  if (buffer.length === 0) {
    return null;
  }

  const text = buffer.toString("utf8");
  if (contentType.includes("application/json") || /^[\s]*[\[{\"]/.test(text)) {
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new LcuProtocolError("LCU returned malformed JSON.", { cause: error });
    }
  }
  return text;
}

export class LcuClient {
  constructor(credentials, { timeoutMs = DEFAULT_TIMEOUT_MS, maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES } = {}) {
    this.credentials = credentials;
    this.timeoutMs = timeoutMs;
    this.maxResponseBytes = maxResponseBytes;
    this.transport = credentials.protocol === "http" ? http : https;
    this.agent = credentials.protocol === "http"
      ? new http.Agent({ keepAlive: true, maxSockets: 4 })
      : new https.Agent({ keepAlive: true, maxSockets: 4, rejectUnauthorized: false });
  }

  async request(endpoint, { method = "GET", body, signal, timeoutMs = this.timeoutMs } = {}) {
    validateEndpoint(endpoint);
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body), "utf8");
    const authorization = Buffer.from(`riot:${this.credentials.token}`, "utf8").toString("base64");

    return new Promise((resolve, reject) => {
      const request = this.transport.request(
        {
          hostname: "127.0.0.1",
          port: this.credentials.port,
          path: endpoint,
          method,
          agent: this.agent,
          signal,
          timeout: timeoutMs,
          headers: {
            Accept: "application/json",
            Authorization: `Basic ${authorization}`,
            "Content-Type": "application/json",
            "User-Agent": "lol-skin-assistant-m0",
            ...(payload ? { "Content-Length": payload.length } : {}),
          },
        },
        (response) => {
          const chunks = [];
          let receivedBytes = 0;

          response.on("data", (chunk) => {
            receivedBytes += chunk.length;
            if (receivedBytes > this.maxResponseBytes) {
              request.destroy(new LcuProtocolError("LCU response exceeded the configured size limit."));
              return;
            }
            chunks.push(chunk);
          });

          response.on("end", () => {
            const statusCode = response.statusCode ?? 0;
            if (statusCode < 200 || statusCode >= 300) {
              reject(new LcuHttpError(endpoint, statusCode));
              return;
            }

            try {
              const contentType = String(response.headers["content-type"] ?? "");
              resolve(parseResponseBody(Buffer.concat(chunks), contentType));
            } catch (error) {
              reject(error);
            }
          });
        },
      );

      request.on("timeout", () => {
        request.destroy(new Error("request timed out"));
      });
      request.on("error", (error) => {
        if (error instanceof LcuProtocolError || error?.name === "AbortError") {
          reject(error);
          return;
        }
        reject(new LcuNetworkError("Could not communicate with the local League client.", { cause: error }));
      });

      if (payload) {
        request.write(payload);
      }
      request.end();
    });
  }

  close() {
    this.agent.destroy();
  }
}
