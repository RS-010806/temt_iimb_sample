import type { Metadata } from 'next';
import { Suspense } from 'react';
import DemoWorkspace from '@/components/demo/demo-workspace';
export const metadata: Metadata={title:'Interactive enterprise demo',description:'Analyze sample freight shipments, compare modes, and export a transparent emissions report.',robots:{index:false,follow:true}};
export default function DemoPage(){return <Suspense fallback={<main id="main" className="page-width section-padding">Loading your sample workspace…</main>}><DemoWorkspace/></Suspense>}
