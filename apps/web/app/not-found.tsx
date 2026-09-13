import Link from 'next/link';
import { Header, Footer } from '@/components/site-chrome';
export default function NotFound(){return <><Header/><main id="main" className="not-found"><p className="eyebrow">404 / ROUTE NOT FOUND</p><h1>LET’S GET YOU<br/>BACK ON TRACK.</h1><Link className="button button-dark" href="/">Back to TEMT ↗</Link></main><Footer/></>}
