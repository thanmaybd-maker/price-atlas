declare module 'qrcode-generator' {
  interface QRCode {
    addData(data: string): void;
    make(): void;
    createDataURL(cellSize?: number, margin?: number): string;
    createImgTag(cellSize?: number, margin?: number): string;
    createSvgTag(
      cellSize?: number | { cellSize?: number; margin?: number; scalable?: boolean },
      margin?: number,
    ): string;
  }
  function qrcode(typeNumber: number, errorCorrectionLevel: string): QRCode;
  export default qrcode;
}
