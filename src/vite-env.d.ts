// CSS module type declaration — allows `import './styles/main.css'` in TypeScript
declare module '*.css' {
  const content: string;
  export default content;
}

// GLSL shader file type declaration (for future file-based imports)
declare module '*.glsl' {
  const src: string;
  export default src;
}

declare module '*.vert.glsl' {
  const src: string;
  export default src;
}

declare module '*.frag.glsl' {
  const src: string;
  export default src;
}
