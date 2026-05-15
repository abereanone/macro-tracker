type Env = {
  ASSETS: Fetcher;
};

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);

  if (url.pathname === '/login' || url.pathname === '/app' || url.pathname.startsWith('/app/')) {
    const indexUrl = new URL('/', url);
    return ctx.env.ASSETS.fetch(new Request(indexUrl, ctx.request));
  }

  return ctx.env.ASSETS.fetch(ctx.request);
};
