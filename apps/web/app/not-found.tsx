import Link from "next/link";
import { Footer, Header } from "@/components/site-chrome";

export default function NotFound() {
  return (
    <>
      <Header />
      <main id="main" className="grid min-h-[60vh] place-items-center bg-paper px-6 py-20 text-center">
        <div>
          <p className="eyebrow">404</p>
          <h1 className="display mt-3 text-[44px]">This route doesn't exist.</h1>
          <p className="mt-3 text-grey-600">The page may have moved. Head back and pick another lane.</p>
          <div className="mt-6 flex justify-center gap-3"><Link href="/" className="btn btn-secondary">Home</Link><Link href="/app/" className="btn btn-primary">Open TEMT</Link></div>
        </div>
      </main>
      <Footer />
    </>
  );
}
