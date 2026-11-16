// .html 파일을 문자열로 import 할 수 있도록 TypeScript에 알려줍니다.
// esbuild의 loader: { ".html": "text" } 설정과 짝을 이룹니다.
declare module "*.html" {
  const content: string;
  export default content;
}
/** true only in dev builds (npm run dev / build:dev); set by build.ts and vite.config.ts. */
declare const __TAB_DEV__: boolean;
