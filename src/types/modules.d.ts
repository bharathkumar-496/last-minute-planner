declare module 'mammoth/mammoth.browser.min.js' {
  export function extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string }>
  const mammoth: { extractRawText: typeof extractRawText }
  export default mammoth
}
