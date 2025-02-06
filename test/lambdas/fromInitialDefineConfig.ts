export const handler = async () => {
  return {
    ok: true,
    ORIGIN: process.env.ORIGIN,
  };
};
