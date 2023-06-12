export class KinesisError extends Error {
  type: string;
  status: number;
  constructor(type: string, status: number, message: string) {
    super(message);
    this.type = type;
    this.status = status;
  }
  toString() {
    return JSON.stringify({ __type: this.type, message: this.message });
  }
}
