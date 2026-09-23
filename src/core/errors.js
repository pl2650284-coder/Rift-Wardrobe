export class DiscoveryError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "DiscoveryError";
  }
}

export class LcuNetworkError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "LcuNetworkError";
  }
}

export class LcuHttpError extends Error {
  constructor(endpoint, statusCode) {
    super(`LCU request failed with HTTP ${statusCode}: ${endpoint}`);
    this.name = "LcuHttpError";
    this.endpoint = endpoint;
    this.statusCode = statusCode;
  }
}

export class LcuProtocolError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "LcuProtocolError";
  }
}

export class SelectionError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = "SelectionError";
    this.code = code;
  }
}
