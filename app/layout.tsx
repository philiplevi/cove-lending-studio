import type { Metadata } from 'next';
export const metadata: Metadata={title:'Cove • Lending Studio',description:'Private lending portfolio workspace',robots:{index:false,follow:false}};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="en"><body style={{margin:0}}>{children}</body></html>}
