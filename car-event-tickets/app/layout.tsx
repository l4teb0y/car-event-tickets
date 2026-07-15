import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata={title:"Car Event Scanner",description:"Camera QR ticket scanner"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}