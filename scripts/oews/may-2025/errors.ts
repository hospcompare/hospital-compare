export class OewsAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OewsAdapterError";
  }
}
