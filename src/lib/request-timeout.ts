/** Bound a read without clearing sessions or treating a network stall as logout. */
export async function withRequestTimeout<T>(
  request: PromiseLike<T>,
  milliseconds = 15000,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(request),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("The connection took too long. Please try again.")),
          milliseconds,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
