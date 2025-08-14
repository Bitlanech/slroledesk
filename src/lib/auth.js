// /src/lib/auth.js
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";

// Wrapper für Next.js API Routes (req/res)
export const withApiSession = (handler) => {
  return async (req, res) => {
    req.session = await getIronSession(req, res, sessionOptions);
    return handler(req, res);
  };
};

// Optional: falls du später getServerSideProps brauchst
export const withSsrSession = (gssp) => {
  return async (context) => {
    const { req, res } = context;
    req.session = await getIronSession(req, res, sessionOptions);
    return gssp(context);
  };
};
