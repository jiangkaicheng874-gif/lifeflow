export class BusinessError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
