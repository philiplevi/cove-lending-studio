import {NextResponse} from 'next/server';
export const dynamic='force-dynamic';
export function GET(){
 const noticeUrl=process.env.COVE_PRIVACY_NOTICE_URL||'';
 const approved=/^https:\/\/[^\s/]+\.[^\s/]+(?:\/[^\s]*)?$/.test(noticeUrl)&&!noticeUrl.includes('.example')&&!noticeUrl.includes('your-approved');
 return NextResponse.json({enabled:process.env.COVE_APPLICATION_INTAKE_ENABLED==='true'&&Boolean(process.env.COVE_PRIVACY_NOTICE_VERSION)&&process.env.COVE_PRIVACY_NOTICE_VERSION!=='UNAPPROVED'&&approved,notice_version:process.env.COVE_PRIVACY_NOTICE_VERSION||'UNAPPROVED',notice_url:approved?noticeUrl:''},{headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
}
