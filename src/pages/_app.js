import "@/styles/globals.css";
import Layout from "@/components/Layout";

export default function MyApp({ Component, pageProps, router }) {
  // Falls die Page einen "noLayout"-Flag hat → direkt rendern
  if (Component.noLayout) {
    return <Component {...pageProps} />;
  }

  return (
    <Layout>
      <Component {...pageProps} />
    </Layout>
  );
}
