import React, { useState, useEffect, useRef, useCallback, FC, FormEvent, MouseEvent as ReactMouseEvent, ChangeEvent, WheelEvent } from 'react';
import { authService, workDataService, User, WorkData, Color } from "./db";

// --- Helper Functions ---

const rgbToHex = (r: number, g: number, b: number): string => '#' + [r, g, b].map(x => {
  const hex = x.toString(16);
  return hex.length === 1 ? '0' + hex : hex;
}).join('');

const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
};


const rgbToHsl = (r: number, g: number, b: number): string => {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
};

const applyFastBoxBlur = (imageData: ImageData, radius: number): ImageData => {
    const { data, width, height } = imageData;
    const radiusInt = Math.floor(radius);
    if (radiusInt < 1) return imageData;

    const resultData = new Uint8ClampedArray(data);
    const tempIn = new Uint8ClampedArray(data);

    // Horizontal pass
    for (let y = 0; y < height; y++) {
        let rSum = 0, gSum = 0, bSum = 0;
        const rowIndex = y * width;
        
        for (let i = -radiusInt; i <= radiusInt; i++) {
            const px = Math.max(0, Math.min(width - 1, i));
            const offset = (rowIndex + px) * 4;
            rSum += tempIn[offset];
            gSum += tempIn[offset + 1];
            bSum += tempIn[offset + 2];
        }

        for (let x = 0; x < width; x++) {
            const offset = (rowIndex + x) * 4;
            const denominator = (Math.min(x + radiusInt, width - 1) - Math.max(x - radiusInt, 0) + 1);
            resultData[offset] = rSum / denominator;
            resultData[offset + 1] = gSum / denominator;
            resultData[offset + 2] = bSum / denominator;
            
            const oldPixelIndex = (rowIndex + Math.max(0, x - radiusInt)) * 4;
            const newPixelIndex = (rowIndex + Math.min(width - 1, x + radiusInt + 1)) * 4;
            
            rSum -= tempIn[oldPixelIndex] - tempIn[newPixelIndex];
            gSum -= tempIn[oldPixelIndex + 1] - tempIn[newPixelIndex + 1];
            bSum -= tempIn[oldPixelIndex + 2] - tempIn[newPixelIndex + 2];
        }
    }
    
    // Vertical pass
    const tempOut = new Uint8ClampedArray(resultData);
    for (let x = 0; x < width; x++) {
        let rSum = 0, gSum = 0, bSum = 0;
        
        for (let i = -radiusInt; i <= radiusInt; i++) {
            const py = Math.max(0, Math.min(height - 1, i));
            const offset = (py * width + x) * 4;
            rSum += tempOut[offset];
            gSum += tempOut[offset + 1];
            bSum += tempOut[offset + 2];
        }

        for (let y = 0; y < height; y++) {
            const offset = (y * width + x) * 4;
            const denominator = (Math.min(y + radiusInt, height - 1) - Math.max(y - radiusInt, 0) + 1);
            resultData[offset] = rSum / denominator;
            resultData[offset + 1] = gSum / denominator;
            resultData[offset + 2] = bSum / denominator;
            
            const oldPixelIndex = (Math.max(0, y - radiusInt) * width + x) * 4;
            const newPixelIndex = (Math.min(height - 1, y + radiusInt + 1) * width + x) * 4;

            rSum -= tempOut[oldPixelIndex] - tempOut[newPixelIndex];
            gSum -= tempOut[oldPixelIndex + 1] - tempOut[newPixelIndex + 1];
            bSum -= tempOut[oldPixelIndex + 2] - tempOut[newPixelIndex + 2];
        }
    }
    
    return new ImageData(resultData, width, height);
}

// --- Icon Components ---

const Icon: FC<{ path: string; className?: string }> = ({ path, className = "h-6 w-6" }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path fillRule="evenodd" d={path} clipRule="evenodd" />
    </svg>
);

const ICONS = {
    UPLOAD: "M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5",
    EYE_DROPPER: "M12.91 1.083a2.5 2.5 0 00-3.496.242l-8.1 9.3c-.05.058-.09.118-.12.18l-1.5 4.5a.75.75 0 00.952.952l4.5-1.5c.062-.03.122-.07.18-.12l9.3-8.1a2.5 2.5 0 00.242-3.496l-2.048-2.048zM11.5 2.5a1 1 0 011.414 0l2.048 2.048a1 1 0 010 1.414l-1.31 1.31-3.464-3.464 1.31-1.31zM6.516 11.016l3.464 3.464-5.488 1.83.6-1.8 1.424-4.27z",
    COPY: "M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a.75.75 0 010 1.5H5.625v12h9.75v-2.625a.75.75 0 011.5 0zM17.25 2.25a2.25 2.25 0 012.25 2.25v10.5a2.25 2.25 0 01-2.25-2.25h-10.5a2.25 2.25 0 01-2.25-2.25V4.5a2.25 2.25 0 012.25-2.25h10.5z",
    LOGOUT: "M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9",
    ZOOM_IN: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6",
    ZOOM_OUT: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM13.5 10.5h-6",
    GOOGLE: "M12.0001 14.6234C11.5126 13.5226 10.8301 12.5368 10.8301 12.5368H7.74011V9.01819H13.6201C13.7401 9.6455 13.7901 10.2727 13.7901 10.9182C13.7901 13.1636 13.1501 15.2509 11.8301 16.8409C10.5101 18.4309 8.67011 19.3455 6.66011 19.3455C2.25011 19.3455 -1.33989 15.8182 -1.33989 11.5C-1.33989 7.18182 2.25011 3.65455 6.66011 3.65455C8.80011 3.65455 10.7401 4.51818 12.1401 5.89091L10.0301 7.94545C9.25011 7.20909 8.23011 6.76364 7.02011 6.76364C4.55011 6.76364 2.58011 8.68182 2.58011 11.0818C2.58011 13.4818 4.55011 15.4 7.02011 15.4C8.42011 15.4 9.56011 14.8364 10.3901 14.0455L12.0001 14.6234Z",
    WARNING: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z",
    LOGO: "M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm-1.125 5.5a1.125 1.125 0 11-2.25 0 1.125 1.125 0 012.25 0zm5.125 0a1.125 1.125 0 11-2.25 0 1.125 1.125 0 012.25 0zM12 17.25c-3.102 0-5.833-1.68-7.25-4.155.263-.12.533-.23.808-.331 1.488-.532 3.033-.814 4.634-.814 1.625 0 3.194.29 4.692.836.262.093.528.196.797.307C17.832 15.567 15.101 17.25 12 17.25z",
    CLOSE: "M6 18L18 6M6 6l12 12",
    SKETCH: "M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10",
    MAGIC_WAND: "M12.001 2.5a.75.75 0 01.75.75v.255a5.25 5.25 0 005.006 5.006h.255a.75.75 0 010 1.5h-.255a5.25 5.25 0 00-5.006 5.006v.255a.75.75 0 01-1.5 0v-.255a5.25 5.25 0 00-5.006-5.006H5.25a.75.75 0 010-1.5h.255a5.25 5.25 0 005.006-5.006V3.25a.75.75 0 01.75-.75zm-3.75 9a.75.75 0 01.75.75v.255a1.5 1.5 0 001.5 1.5h.255a.75.75 0 010 1.5h-.255a1.5 1.5 0 00-1.5 1.5v.255a.75.75 0 01-1.5 0v-.255a1.5 1.5 0 00-1.5-1.5H5.25a.75.75 0 010-1.5h.255a1.5 1.5 0 001.5-1.5V12.25a.75.75 0 01.75-.75zm6-6a.75.75 0 01.75.75v.255a1.5 1.5 0 001.5 1.5h.255a.75.75 0 010 1.5h-.255a1.5 1.5 0 00-1.5 1.5v.255a.75.75 0 01-1.5 0v-.255a1.5 1.5 0 00-1.5-1.5h-.255a.75.75 0 010-1.5h.255a1.5 1.5 0 001.5-1.5V6.25a.75.75 0 01.75-.75z",
    BLUR: "M3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12ZM12 5C8.13401 5 5 8.13401 5 12C5 15.866 8.13401 19 12 19C15.866 19 19 15.866 19 12C19 8.13401 15.866 5 12 5ZM12 7C9.23858 7 7 9.23858 7 12C7 14.7614 9.23858 17 12 17C14.7614 17 17 14.7614 17 12C17 9.23858 14.7614 7 12 7Z",
    SAVE: "M21 13.5V9A2.25 2.25 0 0018.75 6.75h-12A2.25 2.25 0 004.5 9v4.5a2.25 2.25 0 002.25 2.25h12a2.25 2.25 0 002.25-2.25zM6.75 10.5a.75.75 0 01.75-.75h9a.75.75 0 01.75.75v2.25a.75.75 0 01-.75.75h-9a.75.75 0 01-.75-.75v-2.25z",
    LOAD: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25M9 16.5v.75c0 .414.336.75.75.75h1.5M15 12.75a.75.75 0 11-1.5 0 .75.75 0 011.5 0z",
    LOGIN: "M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z",
};

// --- Types ---
interface Color { r: number; g: number; b: number; }
interface User { username: string; }
interface Point { x: number; y: number; }


// --- UI Components ---
const LoadingOverlay: FC<{ message: string }> = ({ message }) => (
    <div className="fixed inset-0 bg-black bg-opacity-70 z-[100] flex flex-col items-center justify-center p-4 animate-fade-in">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-400 mb-4"></div>
        <p className="text-xl text-white font-semibold text-center">{message}</p>
    </div>
);

const Modal: FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
    <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
        <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <header className="flex items-center justify-between p-4 border-b border-gray-700">
                <h2 className="text-xl font-bold text-indigo-400">{title}</h2>
                <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-700 transition-colors ml-2" title="Close">
                    <Icon path={ICONS.CLOSE} className="h-6 w-6 text-white" />
                </button>
            </header>
            <main className="p-6 overflow-y-auto text-gray-300 space-y-4">
                {children}
            </main>
        </div>
    </div>
);

const AboutContent: FC = () => (
    <>
        <p>The AI Color Picker was born from a simple need: a fast, private, and powerful tool for designers and developers. It began as an internal project at <strong className="text-indigo-400">Cee Company(Core Elide Experts)</strong>, developed by lead engineer <strong className="text-indigo-400">Dider</strong>.</p>
        <p>The core philosophy was to leverage modern browser capabilities to create a tool that works entirely offline. No image uploads to servers, no API calls for color analysis. Everything happens right here, in your browser. This commitment to privacy and performance is what sets this tool apart.</p>
        <p>What started as a weekend project quickly became an indispensable part of the Cee workflow. We are proud to share it with the wider community, hoping it simplifies your creative process as much as it has ours.</p>
    </>
);

const PrivacyContent: FC = () => (
    <>
        <h3 className="text-lg font-semibold text-white">Your Privacy is Paramount</h3>
        <p>This application is designed to be 100% private. We believe you shouldn't have to trade your data for functionality.</p>
        <ul className="list-disc list-inside space-y-2 pl-2">
            <li><strong className="text-white">No Server Communication:</strong> All processing, including image analysis, color extraction, object removal, and user authentication, is done locally in your browser. Your images and data are never uploaded or sent anywhere.</li>
            <li><strong className="text-white">Local Storage Only:</strong> User accounts and color history are stored in your browser's `localStorage` and `sessionStorage`. This data remains on your machine and is not accessible by us or any third party.</li>
            <li><strong className="text-white">No Tracking or Analytics:</strong> This tool does not include any third-party tracking scripts or analytics. Your usage is your own business.</li>
            <li><strong className="text-white">Simulated Google Login:</strong> The "Sign up with Google" feature is a simulation. It creates a local account within the app and does not connect to or exchange any information with Google's services.</li>
        </ul>
        <p className="mt-4">In short: what happens in the AI Color Picker, stays in your browser.</p>
    </>
);


// --- Main Color Picker Component ---

const ColorPickerApp: FC<{ user: User | null; onLogin: (user: User) => void; onLogout: () => void; showLoginModal: boolean; setShowLoginModal: (show: boolean) => void }> = ({ user, onLogin, onLogout, showLoginModal, setShowLoginModal }) => {
    // Download format selection state
    const [showFormatOptions, setShowFormatOptions] = useState(false);
    const [selectedFormat, setSelectedFormat] = useState('png');
    const [image, setImage] = useState<HTMLImageElement | null>(null);
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const [startPan, setStartPan] = useState<Point>({ x: 0, y: 0 });
    
    const [magnifier, setMagnifier] = useState({ show: false, x: 0, y: 0, size: 150, zoom: 10 });
    const [mousePos, setMousePos] = useState<Point>({ x: 0, y: 0 });

    const [selection, setSelection] = useState<{ start: Point; end: Point } | null>(null);
    const [isSelecting, setIsSelecting] = useState(false);
    
    const [currentColor, setCurrentColor] = useState<Color | null>(null);
    const [colorHistory, setColorHistory] = useState<Color[]>([]);
    const [dominantColors, setDominantColors] = useState<Color[]>([]);
    
    const [showAbout, setShowAbout] = useState(false);
    const [showPrivacy, setShowPrivacy] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingMessage, setProcessingMessage] = useState('');

    // Editing Modes State
    const [isSketching, setIsSketching] = useState(false);
    const [isRemoving, setIsRemoving] = useState(false);
    const [isBlurring, setIsBlurring] = useState(false);

    // Tool Configurations
    const [penConfig, setPenConfig] = useState({ color: '#FFFFFF', size: 5, mode: 'pen' as 'pen' | 'eraser' });
    const [maskConfig, setMaskConfig] = useState({ size: 20, mode: 'brush' as 'brush' | 'eraser' });
    const [blurConfig, setBlurConfig] = useState({ size: 30, mode: 'brush' as 'brush' | 'eraser', intensity: 10 });

    const [isDrawing, setIsDrawing] = useState(false);

    // Save/Load States
    const [userWorks, setUserWorks] = useState<WorkData[]>([]);
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [showLoadModal, setShowLoadModal] = useState(false);
    const [saveName, setSaveName] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const magnifierCanvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const sketchCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const lastDrawPoint = useRef<Point | null>(null);

    const stopProcessing = useCallback((errorMessage?: string) => {
        if (errorMessage) {
            setProcessingMessage(errorMessage);
            setTimeout(() => {
                setIsProcessing(false);
                setProcessingMessage('');
            }, 3000);
        } else {
            setProcessingMessage('');
            setIsProcessing(false);
        }
    }, []);

    // --- Drawing Logic ---
    // Download handler with format
    const handleDownloadImage = (format: string = 'png') => {
        if (!image) return;
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.drawImage(image, 0, 0);
            if (sketchCanvasRef.current) ctx.drawImage(sketchCanvasRef.current, 0, 0);
        }
        let mimeType = 'image/png';
        let ext = 'png';
        switch (format) {
            case 'jpeg':
            case 'jpg':
                mimeType = 'image/jpeg';
                ext = 'jpg';
                break;
            case 'webp':
                mimeType = 'image/webp';
                ext = 'webp';
                break;
            case 'bmp':
                mimeType = 'image/bmp';
                ext = 'bmp';
                break;
            case 'gif':
                mimeType = 'image/gif';
                ext = 'gif';
                break;
            default:
                mimeType = 'image/png';
                ext = 'png';
        }
        const url = canvas.toDataURL(mimeType);
        const link = document.createElement('a');
        link.href = url;
        link.download = `edited-image.${ext}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d', { willReadFrequently: true });
        if (!ctx || !canvas) return;
        
        const container = containerRef.current;
        if (container) {
          canvas.width = container.clientWidth;
          canvas.height = container.clientHeight;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        if (image) {
          ctx.save();
          ctx.translate(pan.x, pan.y);
          ctx.scale(zoom, zoom);
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(image, 0, 0);

          if (sketchCanvasRef.current) {
              ctx.drawImage(sketchCanvasRef.current, 0, 0);
          }
          if (maskCanvasRef.current && (isRemoving || isBlurring)) {
              ctx.globalAlpha = 0.5; // Make mask visually transparent
              ctx.drawImage(maskCanvasRef.current, 0, 0);
              ctx.globalAlpha = 1.0; // Reset for subsequent drawing
          }
          
          ctx.restore();
        }
        
        if (selection) {
            ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
            ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
            ctx.lineWidth = 1;
            const rect = {
                x: Math.min(selection.start.x, selection.end.x),
                y: Math.min(selection.start.y, selection.end.y),
                w: Math.abs(selection.start.x - selection.end.x),
                h: Math.abs(selection.start.y - selection.end.y)
            };
            ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
            ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
        }
    }, [image, zoom, pan, selection, isRemoving, isBlurring]);

    useEffect(() => {
        draw();
    }, [draw]);

    const screenToImageCoords = (screenPos: Point): Point => {
        return {
            x: (screenPos.x - pan.x) / zoom,
            y: (screenPos.y - pan.y) / zoom
        };
    };

    const drawMagnifier = useCallback(() => {
      const canvas = canvasRef.current;
      const magCanvas = magnifierCanvasRef.current;
      if (!canvas || !magCanvas || !image) return;

      const magCtx = magCanvas.getContext('2d');
      if (!magCtx) return;

      magCanvas.width = magnifier.size;
      magCanvas.height = magnifier.size;

      const sourceSize = magnifier.size / magnifier.zoom;
      const sourceHalf = sourceSize / 2;

      const imgCoords = screenToImageCoords(mousePos);

      magCtx.imageSmoothingEnabled = false;
      magCtx.clearRect(0, 0, magnifier.size, magnifier.size);
      magCtx.drawImage(
          image,
          imgCoords.x - sourceHalf,
          imgCoords.y - sourceHalf,
          sourceSize,
          sourceSize,
          0,
          0,
          magnifier.size,
          magnifier.size
      );
      
      const sketchCanvas = sketchCanvasRef.current;
      if (sketchCanvas) {
        magCtx.drawImage(
            sketchCanvas,
            imgCoords.x - sourceHalf,
            imgCoords.y - sourceHalf,
            sourceSize,
            sourceSize,
            0,
            0,
            magnifier.size,
            magnifier.size
        );
      }

      // Crosshair
      magCtx.strokeStyle = 'rgba(0,0,0,0.5)';
      magCtx.lineWidth = 1;
      magCtx.beginPath();
      magCtx.moveTo(magnifier.size / 2, 0);
      magCtx.lineTo(magnifier.size / 2, magnifier.size);
      magCtx.moveTo(0, magnifier.size / 2);
      magCtx.lineTo(magnifier.size, magnifier.size / 2);
      magCtx.stroke();
      
      // Center pixel outline
      magCtx.strokeStyle = 'white';
      magCtx.strokeRect(magnifier.size / 2 - magnifier.zoom / 2, magnifier.size / 2 - magnifier.zoom / 2, magnifier.zoom, magnifier.zoom);

    }, [image, mousePos, magnifier.size, magnifier.zoom, pan, zoom]);
    
    const currentMode = isSketching ? 'sketch' : isRemoving ? 'remove' : isBlurring ? 'blur' : 'pick';

    useEffect(() => {
      if (magnifier.show && currentMode === 'pick') {
        drawMagnifier();
      }
    }, [magnifier.show, currentMode, drawMagnifier]);


    // --- Color Calculation ---

    const addColorToHistory = (color: Color) => {
        setCurrentColor(color);
        setColorHistory(prev => {
            const newHistory = [color, ...prev.filter(c => !(c.r === color.r && c.g === color.g && c.b === color.b))];
            return newHistory.slice(0, 50); // Limit history size
        });
    };

    const getPixelColor = (pos: Point): Color | null => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx) return null;
        const p = ctx.getImageData(pos.x, pos.y, 1, 1).data;
        return { r: p[0], g: p[1], b: p[2] };
    };

    const getAverageColor = (rect: { x: number; y: number; w: number; h: number }): Color | null => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx || rect.w < 1 || rect.h < 1) return null;
        const data = ctx.getImageData(rect.x, rect.y, rect.w, rect.h).data;
        let r = 0, g = 0, b = 0;
        for (let i = 0; i < data.length; i += 4) {
            r += data[i];
            g += data[i + 1];
            b += data[i + 2];
        }
        const count = data.length / 4;
        return { r: Math.round(r / count), g: Math.round(g / count), b: Math.round(b / count) };
    };
    
    const extractDominantColors = (img: HTMLImageElement) => {
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        if (!tempCtx) return;

        const size = 50; // Downsample for performance
        tempCanvas.width = size;
        tempCanvas.height = size;
        tempCtx.drawImage(img, 0, 0, size, size);

        const data = tempCtx.getImageData(0, 0, size, size).data;
        const colorCount: { [key: string]: { color: Color; count: number } } = {};
        
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const key = `${r},${g},${b}`;
            if (!colorCount[key]) {
                colorCount[key] = { color: { r, g, b }, count: 0 };
            }
            colorCount[key].count++;
        }
        
        const sortedColors = Object.values(colorCount).sort((a, b) => b.count - a.count);
        setDominantColors(sortedColors.slice(0, 10).map(item => item.color));
    };



    // --- Save/Load Functions ---

    const handleSaveWork = async () => {
        if (!image) {
            alert("No image to save!");
            return;
        }

        if (!user) {
            setShowLoginModal(true);
            return;
        }

        setShowSaveModal(true);
    };

    const handleConfirmSave = async () => {
        if (!saveName.trim()) {
            alert("Please enter a name for your work.");
            return;
        }

        if (!user || !image) return;

        setIsSaving(true);
        try {
            const canvas = document.createElement("canvas");
            canvas.width = image.width;
            canvas.height = image.height;
            const ctx = canvas.getContext("2d");
            if (ctx) {
                ctx.drawImage(image, 0, 0);
                const sketchCanvas = sketchCanvasRef.current;
                if (sketchCanvas) {
                    ctx.drawImage(sketchCanvas, 0, 0);
                }
            }
            const imageData = canvas.toDataURL();

            await workDataService.saveWork(user.username, {
                name: saveName.trim(),
                imageData,
                colorHistory,
                currentColor,
                dominantColors,
            });

            setSaveName("");
            setShowSaveModal(false);
            alert("Work saved successfully!");
            
            // Refresh user works
            const works = await workDataService.loadUserWorks(user.username);
            setUserWorks(works);
        } catch (error: any) {
            alert("Failed to save work: " + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleLoadWork = async () => {
        if (!user) {
            setShowLoginModal(true);
            return;
        }

        setIsLoading(true);
        try {
            const works = await workDataService.loadUserWorks(user.username);
            setUserWorks(works);
            setShowLoadModal(true);
        } catch (error: any) {
            alert("Failed to load works: " + error.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSelectWork = (work: WorkData) => {
        const img = new Image();
        img.onload = () => {
            setImage(img);
            setColorHistory(work.colorHistory);
            setCurrentColor(work.currentColor);
            setDominantColors(work.dominantColors);
            
            // Reset canvases
            const createCanvas = (ref: React.MutableRefObject<HTMLCanvasElement | null>) => {
                const canvas = document.createElement("canvas");
                canvas.width = img.width;
                canvas.height = img.height;
                ref.current = canvas;
            };
            createCanvas(sketchCanvasRef);
            createCanvas(maskCanvasRef);
            
            // Reset view
            const container = containerRef.current;
            if (container) {
                const { clientWidth, clientHeight } = container;
                const scaleX = clientWidth / img.width;
                const scaleY = clientHeight / img.height;
                const newZoom = Math.min(scaleX, scaleY) * 0.95;
                setZoom(newZoom);
                setPan({
                    x: (clientWidth - img.width * newZoom) / 2,
                    y: (clientHeight - img.height * newZoom) / 2,
                });
            }
            
            setShowLoadModal(false);
        };
        img.src = work.imageData;
    };

    // Load user works when user logs in
    useEffect(() => {
        if (user) {
            workDataService.loadUserWorks(user.username)
                .then(setUserWorks)
                .catch(console.error);
        }
    }, [user]);

    // --- Event Handlers ---

    const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    setImage(img);

                    const createCanvas = (ref: React.MutableRefObject<HTMLCanvasElement | null>) => {
                        const canvas = document.createElement('canvas');
                        canvas.width = img.width;
                        canvas.height = img.height;
                        ref.current = canvas;
                    };
                    createCanvas(sketchCanvasRef);
                    createCanvas(maskCanvasRef);
                    
                    const container = containerRef.current;
                    if (container) {
                        const { clientWidth, clientHeight } = container;
                        const scaleX = clientWidth / img.width;
                        const scaleY = clientHeight / img.height;
                        const newZoom = Math.min(scaleX, scaleY) * 0.95;
                        setZoom(newZoom);
                        setPan({
                            x: (clientWidth - img.width * newZoom) / 2,
                            y: (clientHeight - img.height * newZoom) / 2,
                        });
                    }
                    extractDominantColors(img);
                    setColorHistory([]);
                    setCurrentColor(null);
                    setSelection(null);
                    setIsSketching(false);
                    setIsRemoving(false);
                    setIsBlurring(false);
                };
                img.src = event.target?.result as string;
            };
            reader.readAsDataURL(file);
        }
    };
    
    // --- Drawing Handlers ---
    const commonDrawStart = (e: ReactMouseEvent<HTMLCanvasElement>, canvasRef: React.RefObject<HTMLCanvasElement>, config: { size: number, mode: string, color?: string }) => {
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;
        
        const pos = screenToImageCoords({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY });
        lastDrawPoint.current = pos;
        
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = config.size;
        
        if (config.mode === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
        } else {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = config.color || 'rgba(255, 0, 0, 1)';
            ctx.fillStyle = config.color || 'rgba(255, 0, 0, 1)';
        }

        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();

        draw();
    };
    
    const commonDrawMove = (e: ReactMouseEvent<HTMLCanvasElement>, canvasRef: React.RefObject<HTMLCanvasElement>) => {
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx || !lastDrawPoint.current) return;
        
        const currentPos = screenToImageCoords({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY });
        
        ctx.beginPath();
        ctx.moveTo(lastDrawPoint.current.x, lastDrawPoint.current.y);
        ctx.lineTo(currentPos.x, currentPos.y);
        ctx.stroke();
        
        lastDrawPoint.current = currentPos;
        draw();
    };

    const commonDrawEnd = () => {
        setIsDrawing(false);
        lastDrawPoint.current = null;
    };

    const handleSketchStart = (e: ReactMouseEvent<HTMLCanvasElement>) => {
        setIsDrawing(true);
        commonDrawStart(e, sketchCanvasRef, penConfig);
    };

    const handleSketchMove = (e: ReactMouseEvent<HTMLCanvasElement>) => {
        if (!isDrawing) return;
        commonDrawMove(e, sketchCanvasRef);
    };
    
    const handleClearSketch = () => {
        const sketchCanvas = sketchCanvasRef.current;
        const sketchCtx = sketchCanvas?.getContext('2d');
        if (sketchCtx && sketchCanvas) {
            sketchCtx.clearRect(0, 0, sketchCanvas.width, sketchCanvas.height);
            draw();
        }
    };
    
    const handleMaskStart = (e: ReactMouseEvent<HTMLCanvasElement>) => {
        setIsDrawing(true);
        let config: { size: number; mode: string; };
        let color: string;

        if (isRemoving) {
            config = maskConfig;
            color = 'rgba(255, 0, 0, 1)';
        } else { // isBlurring
            config = blurConfig;
            color = 'rgba(59, 130, 246, 1)';
        }
        commonDrawStart(e, maskCanvasRef, { ...config, color });
    };
    
    const handleMaskMove = (e: ReactMouseEvent<HTMLCanvasElement>) => {
        if (!isDrawing) return;
        commonDrawMove(e, maskCanvasRef);
    };
    
    const handleClearMask = () => {
        const maskCanvas = maskCanvasRef.current;
        const maskCtx = maskCanvas?.getContext('2d');
        if (maskCtx && maskCanvas) {
            maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
            draw();
        }
    };
    
    const handleApplyBlur = () => {
        if (!image || !maskCanvasRef.current) return;
        setProcessingMessage('Applying blur effect...');
        setIsProcessing(true);

        setTimeout(() => {
            const { width, height } = image;

            const maskCanvas = maskCanvasRef.current!;
            const maskCtx = maskCanvas.getContext('2d')!;
            const maskData = maskCtx.getImageData(0, 0, width, height).data;

            let hasMask = false;
            for (let i = 3; i < maskData.length; i += 4) {
                if (maskData[i] > 0) { hasMask = true; break; }
            }
            if (!hasMask) { setIsProcessing(false); return; }

            const mainCanvas = document.createElement('canvas');
            mainCanvas.width = width;
            mainCanvas.height = height;
            const mainCtx = mainCanvas.getContext('2d', { willReadFrequently: true });
            if (!mainCtx) { setIsProcessing(false); return; }
            
            mainCtx.drawImage(image, 0, 0);
            const originalImageData = mainCtx.getImageData(0, 0, width, height);
            const blurredImageData = applyFastBoxBlur(originalImageData, blurConfig.intensity / 2);

            const resultData = originalImageData.data;
            const blurredData = blurredImageData.data;

            for (let i = 0; i < resultData.length; i += 4) {
                const maskAlpha = maskData[i + 3] / 255;
                if (maskAlpha > 0) {
                    resultData[i] = resultData[i] * (1 - maskAlpha) + blurredData[i] * maskAlpha;
                    resultData[i + 1] = resultData[i + 1] * (1 - maskAlpha) + blurredData[i + 1] * maskAlpha;
                    resultData[i + 2] = resultData[i + 2] * (1 - maskAlpha) + blurredData[i + 2] * maskAlpha;
                }
            }
            mainCtx.putImageData(new ImageData(resultData, width, height), 0, 0);

            const newImg = new Image();
            newImg.onload = () => {
                setImage(newImg);
                handleClearMask();
                setIsBlurring(false);
                extractDominantColors(newImg);
                setIsProcessing(false);
            };
            newImg.src = mainCanvas.toDataURL();

        }, 50);
    };

    const handleRemoveObject = () => {
        if (!image || !maskCanvasRef.current) return;

        const maskCanvas = maskCanvasRef.current!;
        const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true })!;
        const maskPixelData = maskCtx.getImageData(0, 0, image.width, image.height).data;
        
        let hasMask = false;
        for (let i = 3; i < maskPixelData.length; i += 4) {
            if (maskPixelData[i] > 128) {
                hasMask = true;
                break;
            }
        }
        if (!hasMask) return;

        setProcessingMessage('Reconstructing image textures locally... This may take a moment.');
        setIsProcessing(true);

        setTimeout(() => {
            const { width, height } = image;
            const workCanvas = document.createElement('canvas');
            workCanvas.width = width;
            workCanvas.height = height;
            const ctx = workCanvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) {
                stopProcessing('Failed to create drawing context.');
                return;
            }

            ctx.drawImage(image, 0, 0);
            const imageData = ctx.getImageData(0, 0, width, height);
            const data = imageData.data;
            
            const mask = new Uint8Array(width * height);
            let maskedPixelCount = 0;
            const maskData = maskCanvasRef.current!.getContext('2d')!.getImageData(0, 0, width, height).data;
            for (let i = 0; i < maskData.length; i += 4) {
                if (maskData[i + 3] > 128) {
                    mask[i / 4] = 1; // 1 means masked/hole
                    maskedPixelCount++;
                }
            }

            const PATCH_RADIUS = 4;
            const SEARCH_WINDOW_RADIUS = 40;
            const maxIterations = maskedPixelCount + 10; // Safety break
            let iterations = 0;

            while (maskedPixelCount > 0 && iterations < maxIterations) {
                iterations++;
                
                let bestBoundaryPixel = { x: -1, y: -1, knownPixels: -1 };

                for (let y = PATCH_RADIUS; y < height - PATCH_RADIUS; y++) {
                    for (let x = PATCH_RADIUS; x < width - PATCH_RADIUS; x++) {
                        const idx = y * width + x;
                        if (mask[idx] !== 1) continue;

                        let isBoundary = false;
                        for (let ny = -1; ny <= 1; ny++) {
                            for (let nx = -1; nx <= 1; nx++) {
                                if (nx === 0 && ny === 0) continue;
                                if (mask[(y + ny) * width + (x + nx)] === 0) {
                                    isBoundary = true;
                                    break;
                                }
                            }
                            if (isBoundary) break;
                        }

                        if (isBoundary) {
                            let knownPixelsInPatch = 0;
                            for (let py = -PATCH_RADIUS; py <= PATCH_RADIUS; py++) {
                                for (let px = -PATCH_RADIUS; px <= PATCH_RADIUS; px++) {
                                    if (mask[(y + py) * width + (x + px)] === 0) {
                                        knownPixelsInPatch++;
                                    }
                                }
                            }
                            if (knownPixelsInPatch > bestBoundaryPixel.knownPixels) {
                                bestBoundaryPixel = { x, y, knownPixels: knownPixelsInPatch };
                            }
                        }
                    }
                }

                if (bestBoundaryPixel.x === -1) break;

                const p = bestBoundaryPixel;
                let bestMatch = { ssd: Infinity, x: -1, y: -1 };

                const searchYStart = Math.max(PATCH_RADIUS, p.y - SEARCH_WINDOW_RADIUS);
                const searchYEnd = Math.min(height - PATCH_RADIUS - 1, p.y + SEARCH_WINDOW_RADIUS);
                const searchXStart = Math.max(PATCH_RADIUS, p.x - SEARCH_WINDOW_RADIUS);
                const searchXEnd = Math.min(width - PATCH_RADIUS - 1, p.x + SEARCH_WINDOW_RADIUS);

                for (let y = searchYStart; y <= searchYEnd; y++) {
                    for (let x = searchXStart; x <= searchXEnd; x++) {
                        let isSourceValid = true;
                        for (let py = -PATCH_RADIUS; py <= PATCH_RADIUS; py++) {
                            for (let px = -PATCH_RADIUS; px <= PATCH_RADIUS; px++) {
                                if (mask[(y + py) * width + (x + px)] === 1) {
                                    isSourceValid = false; break;
                                }
                            }
                            if (!isSourceValid) break;
                        }
                        if (!isSourceValid) continue;

                        let currentSsd = 0;
                        for (let py = -PATCH_RADIUS; py <= PATCH_RADIUS; py++) {
                            for (let px = -PATCH_RADIUS; px <= PATCH_RADIUS; px++) {
                                const targetIdx = (p.y + py) * width + (p.x + px);
                                if (mask[targetIdx] === 0) {
                                    const sourceIdx = (y + py) * width + (x + px);
                                    const tOff = targetIdx * 4;
                                    const sOff = sourceIdx * 4;
                                    const dr = data[tOff] - data[sOff];
                                    const dg = data[tOff + 1] - data[sOff + 1];
                                    const db = data[tOff + 2] - data[sOff + 2];
                                    currentSsd += dr * dr + dg * dg + db * db;
                                }
                            }
                        }

                        if (currentSsd < bestMatch.ssd) {
                            bestMatch = { ssd: currentSsd, x, y };
                        }
                    }
                }

                if (bestMatch.x !== -1) {
                    for (let py = -PATCH_RADIUS; py <= PATCH_RADIUS; py++) {
                        for (let px = -PATCH_RADIUS; px <= PATCH_RADIUS; px++) {
                            const targetIdx = (p.y + py) * width + (p.x + px);
                            if (mask[targetIdx] === 1) {
                                const sourceIdx = (bestMatch.y + py) * width + (bestMatch.x + px);
                                const tOff = targetIdx * 4;
                                const sOff = sourceIdx * 4;
                                data[tOff] = data[sOff];
                                data[tOff + 1] = data[sOff + 1];
                                data[tOff + 2] = data[sOff + 2];
                                mask[targetIdx] = 0;
                                maskedPixelCount--;
                            }
                        }
                    }
                } else {
                    break; 
                }
            }

            ctx.putImageData(imageData, 0, 0);

            const newImg = new Image();
            newImg.onload = () => {
                setImage(newImg);
                handleClearMask();
                setIsRemoving(false);
                extractDominantColors(newImg);
                setColorHistory([]);
                setCurrentColor(null);
                stopProcessing();
            };
            newImg.onerror = () => {
                stopProcessing('Failed to load locally generated image.');
            };
            newImg.src = workCanvas.toDataURL();

        }, 50);
    };
    
    // --- General Mouse Handlers ---
    const handleMouseDown = (e: ReactMouseEvent<HTMLCanvasElement>) => {
        if (isSketching) { handleSketchStart(e); return; }
        if (isRemoving || isBlurring) { handleMaskStart(e); return; }
        
        const pos = { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY };
        if (e.shiftKey) {
            setIsSelecting(true);
            setSelection({ start: pos, end: pos });
        } else {
            setIsPanning(true);
            setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
        }
    };

    const handleMouseUp = (e: ReactMouseEvent<HTMLCanvasElement>) => {
        if (isDrawing) { commonDrawEnd(); }
        if (isPanning) { setIsPanning(false); }

        if (isSelecting && selection) {
            const rect = {
                x: Math.min(selection.start.x, selection.end.x),
                y: Math.min(selection.start.y, selection.end.y),
                w: Math.abs(selection.start.x - selection.end.x),
                h: Math.abs(selection.start.y - selection.end.y)
            };
            if(rect.w > 0 && rect.h > 0) {
                const avgColor = getAverageColor(rect);
                if (avgColor) addColorToHistory(avgColor);
            }
            setIsSelecting(false);
            setSelection(null);
        }
    };

    const handleMouseMove = (e: ReactMouseEvent<HTMLCanvasElement>) => {
        const pos = { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY };
        setMousePos(pos);
        
        if (isSketching) { handleSketchMove(e); return; }
        if (isRemoving || isBlurring) { handleMaskMove(e); return; }

        setMagnifier(prev => ({ ...prev, show: true, x: e.clientX, y: e.clientY }));

        if (isPanning) {
            setPan({ x: e.clientX - startPan.x, y: e.clientY - startPan.y });
        } else if (isSelecting && selection) {
            setSelection({ ...selection, end: pos });
        }
    };
    
    const handleMouseLeave = () => {
        if (isDrawing) { commonDrawEnd(); }
        if (isPanning) { setIsPanning(false); }
        if (isSelecting) { setIsSelecting(false); setSelection(null); }
        
        setMagnifier(prev => ({ ...prev, show: false }));
    };
    
    const handleClick = (e: ReactMouseEvent<HTMLCanvasElement>) => {
        if (currentMode !== 'pick' || isPanning || isSelecting || selection) return;
        
        const pos = { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY };
        const color = getPixelColor(pos);
        if (color) addColorToHistory(color);
    };

    const handleWheel = (e: WheelEvent<HTMLDivElement>) => {
        if (currentMode !== 'pick') return; 
        e.preventDefault();
        const scaleAmount = 1.1;
        const newZoom = e.deltaY > 0 ? zoom / scaleAmount : zoom * scaleAmount;
        
        const mouseX = e.clientX - (containerRef.current?.getBoundingClientRect().left ?? 0);
        const mouseY = e.clientY - (containerRef.current?.getBoundingClientRect().top ?? 0);

        const mousePointTo = {
            x: (mouseX - pan.x) / zoom,
            y: (mouseY - pan.y) / zoom,
        };

        setPan({
            x: mouseX - mousePointTo.x * newZoom,
            y: mouseY - mousePointTo.y * newZoom,
        });
        setZoom(newZoom);
    };

    const handleZoom = (direction: 'in' | 'out') => {
        const container = containerRef.current;
        if (!container) return;
    
        const scaleAmount = 1.2;
        const newZoom = direction === 'in' ? zoom * scaleAmount : zoom / scaleAmount;
    
        const centerX = container.clientWidth / 2;
        const centerY = container.clientHeight / 2;
    
        const centerPointTo = {
            x: (centerX - pan.x) / zoom,
            y: (centerY - pan.y) / zoom,
        };
    
        setPan({
            x: centerX - centerPointTo.x * newZoom,
            y: centerY - centerPointTo.y * newZoom,
        });
        setZoom(newZoom);
    };

    const handleMagnifierZoomChange = (e: ChangeEvent<HTMLInputElement>) => {
        const newZoom = parseInt(e.target.value, 10);
        setMagnifier(prev => ({ ...prev, zoom: newZoom }));
    };

    // --- Render ---

    const color = currentColor;
    const hex = color ? rgbToHex(color.r, color.g, color.b) : '';
    const rgb = color ? `rgb(${color.r}, ${color.g}, ${color.b})` : '';
    const hsl = color ? rgbToHsl(color.r, color.g, color.b) : '';
    
    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    return (
        <div className="flex h-screen w-screen bg-gray-800 text-white font-sans">
            <style>{`.bg-dots { background-image: radial-gradient(#4a5568 1px, transparent 0); background-size: 20px 20px; } .animate-fade-in { animation: fadeIn 0.3s ease-out forwards; } @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
            
            {isProcessing && <LoadingOverlay message={processingMessage} />}
            
            {showAbout && (
                <Modal title="About AI Color Picker" onClose={() => setShowAbout(false)}>
                    <AboutContent />
                </Modal>
            )}

            {showPrivacy && (
                <Modal title="Privacy Policy" onClose={() => setShowPrivacy(false)}>
                    <PrivacyContent />
                </Modal>
            )}

            {showLoginModal && (
                <Modal title="Login Required" onClose={() => setShowLoginModal(false)}>
                    <LoginSignupForm onLoginSuccess={(user) => {
                        onLogin(user);
                        setShowLoginModal(false);
                    }} />
                </Modal>
            )}

            {showSaveModal && (
                <Modal title="Save Your Work" onClose={() => setShowSaveModal(false)}>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">Work Name</label>
                            <input 
                                type="text" 
                                value={saveName} 
                                onChange={(e) => setSaveName(e.target.value)}
                                placeholder="Enter a name for your work..."
                                className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                autoFocus
                            />
                        </div>
                        <div className="flex gap-2 justify-end">
                            <button 
                                onClick={() => setShowSaveModal(false)}
                                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-md transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleConfirmSave}
                                disabled={isSaving || !saveName.trim()}
                                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSaving ? "Saving..." : "Save"}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {showLoadModal && (
                <Modal title="Load Your Work" onClose={() => setShowLoadModal(false)}>
                    <div className="space-y-4">
                        {userWorks.length === 0 ? (
                            <p className="text-gray-400 text-center py-8">No saved works found.</p>
                        ) : (
                            <div className="grid gap-3 max-h-96 overflow-y-auto">
                                {userWorks.map((work) => (
                                    <div 
                                        key={work.id}
                                        className="flex items-center gap-3 p-3 bg-gray-700 rounded-md hover:bg-gray-600 cursor-pointer transition-colors"
                                        onClick={() => handleSelectWork(work)}
                                    >
                                        <img 
                                            src={work.imageData} 
                                            alt={work.name}
                                            className="w-16 h-16 object-cover rounded-md"
                                        />
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-medium text-white truncate">{work.name}</h3>
                                            <p className="text-sm text-gray-400">Saved: {new Date(work.savedAt).toLocaleDateString()}</p>
                                            <p className="text-xs text-gray-500">{work.colorHistory.length} colors</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </Modal>
            )}

            {magnifier.show && currentMode === 'pick' && (
                <div 
                  className="pointer-events-none absolute z-50 rounded-full border-4 border-white shadow-2xl overflow-hidden"
                  style={{ 
                      left: magnifier.x - magnifier.size / 2, 
                      top: magnifier.y - magnifier.size / 2, 
                      width: magnifier.size, 
                      height: magnifier.size,
                  }}>
                    <canvas ref={magnifierCanvasRef} />
                </div>
            )}
            
            {image && (currentMode !== 'pick') && (
                 <div 
                    className="pointer-events-none absolute z-50 rounded-full border"
                    style={{
                        left: mousePos.x + (containerRef.current?.getBoundingClientRect().left ?? 0),
                        top: mousePos.y + (containerRef.current?.getBoundingClientRect().top ?? 0),
                        width: (currentMode === 'sketch' ? penConfig.size : currentMode === 'remove' ? maskConfig.size : blurConfig.size) * zoom,
                        height: (currentMode === 'sketch' ? penConfig.size : currentMode === 'remove' ? maskConfig.size : blurConfig.size) * zoom,
                        transform: 'translate(-50%, -50%)',
                        borderColor: currentMode === 'sketch' 
                            ? (penConfig.mode === 'eraser' ? 'rgba(0,0,0,0.7)' : penConfig.color)
                            : currentMode === 'remove'
                                ? 'rgba(255,0,0,0.7)'
                                : 'rgba(59, 130, 246, 0.7)',
                        backgroundColor: currentMode === 'sketch' 
                            ? (penConfig.mode === 'pen' ? 'transparent' : 'rgba(255,255,255,0.5)')
                            : currentMode === 'remove'
                                ? (maskConfig.mode === 'brush' ? 'rgba(255,0,0,0.2)' : 'rgba(255,255,255,0.5)')
                                : (blurConfig.mode === 'brush' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.5)'),
                        borderWidth: 2,
                    }}
                />
            )}

            {/* Sidebar */}
            <aside className="w-80 bg-gray-900 p-4 flex flex-col space-y-6 overflow-y-auto">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {/* <Icon path={ICONS.LOGO} className="h-8 w-8 text-indigo-400" /> */}
                        <img src="./public/logo.jpg" alt="Logo" className="h-28 w-28 mr-2" onClick={() => window.location.reload()} />
                        <h1 className="text-2xl font-extrabold text-indigo-400" onClick={() => window.location.reload()} >
                          <sup>AI</sup><sub>Pixnerase</sub>
                        </h1>
                    </div>
                    {user ? (
                        <button onClick={onLogout} className="p-2 rounded-md hover:bg-gray-700 transition-colors" title="Logout">
                          <Icon path={ICONS.LOGOUT} />
                        </button>
                    ) : (
                        <button onClick={() => setShowLoginModal(true)} className="p-2 rounded-md hover:bg-gray-700 transition-colors" title="Login">
                          <Icon path={ICONS.LOGIN} />
                        </button>
                    )}
                </div>
                {user && <div className="text-sm text-gray-400">Welcome, {user.username}!</div>}

                {/* Save/Load Tools */}
                <div className="grid grid-cols-2 gap-2">
                    <button 
                        onClick={handleSaveWork}
                        className="flex items-center justify-center gap-2 p-2 rounded-md bg-green-600 hover:bg-green-700 transition-colors font-semibold text-white"
                        disabled={!image}
                    >
                        <Icon path={ICONS.SAVE} className="h-5 w-5" />
                        <span>Save</span>
                    </button>
                    <button 
                        onClick={handleLoadWork}
                        className="flex items-center justify-center gap-2 p-2 rounded-md bg-blue-600 hover:bg-blue-700 transition-colors font-semibold text-white"
                        disabled={isLoading}
                    >
                        <Icon path={ICONS.LOAD} className="h-5 w-5" />
                        <span>{isLoading ? "Loading..." : "Load"}</span>
                    </button>
                </div>

                {/* Editing Tools */}
                {image && (
                    <div className="space-y-3 pt-2 border-t border-gray-700">
                         <div className="grid grid-cols-3 gap-2">
                            <button 
                                onClick={() => { setIsSketching(!isSketching); setIsRemoving(false); setIsBlurring(false); }}
                                className={`w-full flex items-center justify-center gap-2 p-2 rounded-md transition-colors font-semibold ${isSketching ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                            >
                                <Icon path={ICONS.SKETCH} className="h-5 w-5" />
                                <span>{isSketching ? 'Exit' : 'Sketch'}</span>
                            </button>
                             <button 
                                onClick={() => { setIsRemoving(!isRemoving); setIsSketching(false); setIsBlurring(false); }}
                                className={`w-full flex items-center justify-center gap-2 p-2 rounded-md transition-colors font-semibold ${isRemoving ? 'bg-red-600 hover:bg-red-700' : 'bg-purple-600 hover:bg-purple-700'}`}
                            >
                                <Icon path={ICONS.MAGIC_WAND} className="h-5 w-5" />
                                <span>{isRemoving ? 'Exit' : 'Remove'}</span>
                            </button>
                             <button 
                                onClick={() => { setIsBlurring(!isBlurring); setIsSketching(false); setIsRemoving(false); }}
                                className={`w-full flex items-center justify-center gap-2 p-2 rounded-md transition-colors font-semibold ${isBlurring ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                            >
                                <Icon path={ICONS.BLUR} className="h-5 w-5" />
                                <span>{isBlurring ? 'Exit' : 'Blur'}</span>
                            </button>
                        </div>
                        {/* Download Button with Format Selection */}
                        <div className="w-full mt-2 flex flex-col gap-2">
                            <button
                                onClick={() => setShowFormatOptions(true)}
                                className="flex items-center justify-center gap-2 p-2 rounded-md bg-yellow-500 hover:bg-yellow-600 transition-colors font-semibold text-white"
                                disabled={!image}
                            >
                                <Icon path={ICONS.SAVE} className="h-5 w-5" />
                                <span>Download Edited Image</span>
                            </button>
                            {showFormatOptions && (
                                <div className="mt-2 bg-gray-800 p-3 rounded shadow-lg flex flex-col gap-2">
                                    <label className="text-gray-300 font-semibold mb-1">Select Format:</label>
                                    <select
                                        value={selectedFormat}
                                        onChange={e => setSelectedFormat(e.target.value)}
                                        className="p-2 rounded bg-gray-700 text-white"
                                    >
                                        <option value="png">PNG</option>
                                        <option value="jpeg">JPG</option>
                                        <option value="webp">WebP</option>
                                        <option value="bmp">BMP</option>
                                        <option value="gif">GIF</option>
                                    </select>
                                    <button
                                        onClick={() => { handleDownloadImage(selectedFormat); setShowFormatOptions(false); }}
                                        className="mt-2 p-2 rounded bg-green-600 hover:bg-green-700 text-white font-semibold"
                                    >
                                        Download as {selectedFormat.toUpperCase()}
                                    </button>
                                    <button
                                        onClick={() => setShowFormatOptions(false)}
                                        className="mt-1 p-2 rounded bg-gray-600 hover:bg-gray-700 text-white text-sm"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
                
                {/* Sketching Contextual Tools */}
                {isSketching && image && (
                    <div className="space-y-4 p-4 bg-gray-800 rounded-lg animate-fade-in border border-gray-700">
                        <h3 className="font-semibold text-gray-300">Sketch Tools</h3>
                        <div className="grid grid-cols-2 gap-2">
                            <button onClick={() => setPenConfig(p => ({...p, mode: 'pen'}))} className={`p-2 rounded-md text-sm transition-colors ${penConfig.mode === 'pen' ? 'bg-indigo-500 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}>Pen</button>
                            <button onClick={() => setPenConfig(p => ({...p, mode: 'eraser'}))} className={`p-2 rounded-md text-sm transition-colors ${penConfig.mode === 'eraser' ? 'bg-indigo-500 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}>Eraser</button>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-400">Color</label>
                            <input type="color" value={penConfig.color} onChange={(e) => setPenConfig(p => ({...p, color: e.target.value}))} className="w-full h-10 p-1 bg-gray-700 border border-gray-600 rounded-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" disabled={penConfig.mode === 'eraser'}/>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-400 flex justify-between">
                                <span>Size</span><span>{penConfig.size}px</span>
                            </label>
                            <input type="range" min="1" max="50" value={penConfig.size} onChange={(e) => setPenConfig(p => ({...p, size: parseInt(e.target.value, 10)}))} className="w-full h-2 mt-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                        </div>
                        <button onClick={handleClearSketch} className="w-full text-sm bg-red-800/50 text-red-300 p-2 rounded-md hover:bg-red-800/80 transition-colors">Clear Sketch</button>
                    </div>
                )}
                
                {/* Object Removal Contextual Tools */}
                {isRemoving && image && (
                    <div className="space-y-4 p-4 bg-gray-800 rounded-lg animate-fade-in border border-gray-700">
                        <h3 className="font-semibold text-gray-300">Object Removal Tools</h3>
                        <p className="text-sm text-gray-400">Paint a mask over the object you want to remove.</p>
                        <div className="grid grid-cols-2 gap-2">
                            <button onClick={() => setMaskConfig(p => ({...p, mode: 'brush'}))} className={`p-2 rounded-md text-sm transition-colors ${maskConfig.mode === 'brush' ? 'bg-purple-500 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}>Brush</button>
                            <button onClick={() => setMaskConfig(p => ({...p, mode: 'eraser'}))} className={`p-2 rounded-md text-sm transition-colors ${maskConfig.mode === 'eraser' ? 'bg-purple-500 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}>Eraser</button>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-400 flex justify-between">
                                <span>Brush Size</span><span>{maskConfig.size}px</span>
                            </label>
                            <input type="range" min="5" max="100" value={maskConfig.size} onChange={(e) => setMaskConfig(p => ({...p, size: parseInt(e.target.value, 10)}))} className="w-full h-2 mt-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500" />
                        </div>
                        <div className="flex gap-2">
                             <button onClick={handleClearMask} className="w-full text-sm bg-red-800/50 text-red-300 p-2 rounded-md hover:bg-red-800/80 transition-colors">Clear</button>
                             <button onClick={handleRemoveObject} className="w-full text-sm bg-green-600 text-white p-2 rounded-md hover:bg-green-700 transition-colors font-semibold" disabled={isProcessing}>
                                 {isProcessing ? 'Processing...' : 'Apply'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Blur Contextual Tools */}
                {isBlurring && image && (
                    <div className="space-y-4 p-4 bg-gray-800 rounded-lg animate-fade-in border border-gray-700">
                        <h3 className="font-semibold text-gray-300">Blur Tools</h3>
                        <p className="text-sm text-gray-400">Paint a mask over the area you want to blur.</p>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={() => setBlurConfig(p => ({ ...p, mode: 'brush' }))}
                                className={`p-2 rounded-md text-sm transition-colors ${blurConfig.mode === 'brush' ? 'bg-blue-500 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}
                            >
                                Brush
                            </button>
                            <button
                                onClick={() => setBlurConfig(p => ({ ...p, mode: 'eraser' }))}
                                className={`p-2 rounded-md text-sm transition-colors ${blurConfig.mode === 'eraser' ? 'bg-blue-500 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}
                            >
                                Eraser
                            </button>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-400 flex justify-between">
                                <span>Brush Size</span><span>{blurConfig.size}px</span>
                            </label>
                            <input
                                type="range"
                                min="5"
                                max="100"
                                value={blurConfig.size}
                                onChange={(e) => setBlurConfig(p => ({ ...p, size: parseInt(e.target.value, 10) }))}
                                className="w-full h-2 mt-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-400 flex justify-between">
                                <span>Blur Intensity</span><span>{blurConfig.intensity}</span>
                            </label>
                            <input
                                type="range"
                                min="1"
                                max="50"
                                value={blurConfig.intensity}
                                onChange={(e) => setBlurConfig(p => ({ ...p, intensity: parseInt(e.target.value, 10) }))}
                                className="w-full h-2 mt-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                            />
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={handleClearMask}
                                className="w-full text-sm bg-red-800/50 text-red-300 p-2 rounded-md hover:bg-red-800/80 transition-colors"
                            >
                                Clear
                            </button>
                            <button
                                onClick={handleApplyBlur}
                                className="w-full text-sm bg-green-600 text-white p-2 rounded-md hover:bg-green-700 transition-colors font-semibold"
                                disabled={isProcessing}
                            >
                                {isProcessing ? 'Processing...' : 'Apply Blur'}
                            </button>
                        </div>
                    </div>
                )}


                {/* Magnifier Controls */}
                <div className="space-y-3 pt-2 border-t border-gray-700">
                    <label htmlFor="magnifier-zoom" className="font-semibold text-gray-300 flex justify-between items-center">
                        <span>Magnifier Zoom</span>
                        <span className="font-mono text-sm text-indigo-400">{magnifier.zoom}x</span>
                    </label>
                    <input id="magnifier-zoom" type="range" min="1" max="30" step="1" value={magnifier.zoom} onChange={handleMagnifierZoomChange} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500" disabled={currentMode !== 'pick'} />
                </div>

                {/* Current Color */}
                <div className="space-y-3">
                    <h2 className="font-semibold text-gray-300">Current Color</h2>
                    <div className="h-24 w-full rounded-lg" style={{ backgroundColor: hex || 'transparent', border: !color ? '2px dashed #4A5568' : '' }}></div>
                    {color && (
                        <div className="space-y-2 text-sm">
                            {[ {label: 'HEX', value: hex}, {label: 'RGB', value: rgb}, {label: 'HSL', value: hsl} ].map(({label, value}) => (
                                <div key={label} className="flex items-center justify-between bg-gray-800 p-2 rounded-md">
                                    <span className="font-mono text-gray-400">{label}: {value}</span>
                                    <button onClick={() => copyToClipboard(value)} className="p-1 rounded hover:bg-gray-700 transition-colors" title={`Copy ${label}`}>
                                      <Icon path={ICONS.COPY} className="h-4 w-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Color History */}
                <div className="space-y-3">
                    <h2 className="font-semibold text-gray-300">History</h2>
                    <div className="grid grid-cols-8 gap-2">
                        {colorHistory.map((c, i) => {
                            const isActive = currentColor && c.r === currentColor.r && c.g === currentColor.g && c.b === color.b;
                            return (
                                <div key={i} 
                                     className={`h-8 w-8 rounded-md cursor-pointer transition-all hover:scale-110 ${isActive ? 'ring-2 ring-offset-2 ring-offset-gray-900 ring-indigo-400' : ''}`}
                                     style={{ backgroundColor: rgbToHex(c.r, c.g, c.b) }}
                                     onClick={() => setCurrentColor(c)}
                                     title={`Set as current: ${rgbToHex(c.r, c.g, c.b)}`}
                                />
                            );
                        })}
                    </div>
                </div>


                {/* Dominant Colors */}
                {image && (
                    <div className="space-y-3">
                        <h2 className="font-semibold text-gray-300">Dominant Colors</h2>
                        <div className="grid grid-cols-5 gap-2">
                            {dominantColors.map((c, i) => (
                                <div key={i}
                                    className="h-10 w-10 rounded-lg cursor-pointer transition-transform hover:scale-110"
                                    style={{ backgroundColor: rgbToHex(c.r, c.g, c.b) }}
                                    onClick={() => addColorToHistory(c)}
                                    title={`Pick dominant: ${rgbToHex(c.r, c.g, c.b)}`}
                                />
                            ))}
                        </div>
                    </div>
                )}
                
                {/* Sidebar Footer */}
                <div className="mt-auto pt-4 border-t border-gray-700 text-center text-xs text-gray-500">
                    <p>Created by Dider @ Cee Company</p>
                    <div className="flex justify-center gap-4 mt-2">
                        <button onClick={() => setShowAbout(true)} className="hover:text-indigo-400 hover:underline" title="About this tool">About</button>
                        <button onClick={() => setShowPrivacy(true)} className="hover:text-indigo-400 hover:underline" title="View Privacy Policy">Privacy</button>
                        <button className="hover:text-indigo-400 hover:underline" title="View Terms & Conditions" onClick={() => document.getElementById('termsModal')!.style.display='block'}>Terms & Conditions</button>
                        
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 bg-gray-800 flex items-center justify-center p-4">
                <div ref={containerRef} className="relative h-full w-full bg-dots" onWheel={handleWheel}>
                    {!image ? (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <label className="flex flex-col items-center px-6 py-8 bg-gray-700 text-indigo-400 rounded-lg shadow-lg tracking-wide uppercase border border-dashed border-indigo-400 cursor-pointer hover:bg-indigo-400 hover:text-white transition-colors">
                                <Icon path={ICONS.UPLOAD} className="h-12 w-12" />
                                <span className="mt-2 text-base leading-normal">Select an image</span>
                                <input type='file' className="hidden" accept="image/*" onChange={handleImageUpload} />
                            </label>
                        </div>
                    ) : (
                        <>
                            <canvas
                                ref={canvasRef}
                                className={currentMode !== 'pick' ? 'cursor-none' : 'cursor-crosshair'}
                                onMouseDown={handleMouseDown}
                                onMouseUp={handleMouseUp}
                                onMouseMove={handleMouseMove}
                                onMouseLeave={handleMouseLeave}
                                onClick={handleClick}
                            />
                            {currentMode === 'pick' && (
                                <>
                                <div className="absolute bottom-4 left-4 z-10 bg-black/50 p-2 rounded-md text-xs text-gray-300 pointer-events-none">
                                    <p><strong className="font-semibold text-white">Click:</strong> Pick color</p>
                                    <p><strong className="font-semibold text-white">Drag:</strong> Pan image</p>
                                    <p><strong className="font-semibold text-white">Shift+Drag:</strong> Select area</p>
                                    <p><strong className="font-semibold text-white">Scroll:</strong> Zoom in/out</p>
                                </div>
                                <div className="absolute bottom-4 right-4 z-10 flex flex-col space-y-2">
                                    <button
                                        onClick={() => handleZoom('in')}
                                        className="p-2 bg-gray-700 rounded-full text-white hover:bg-gray-600 transition-colors shadow-lg"
                                        aria-label="Zoom in"
                                        title="Zoom In"
                                    >
                                        <Icon path={ICONS.ZOOM_IN} className="h-6 w-6" />
                                    </button>
                                    <button
                                        onClick={() => handleZoom('out')}
                                        className="p-2 bg-gray-700 rounded-full text-white hover:bg-gray-600 transition-colors shadow-lg"
                                        aria-label="Zoom out"
                                        title="Zoom Out"
                                    >
                                        <Icon path={ICONS.ZOOM_OUT} className="h-6 w-6" />
                                    </button>
                                </div>
                                </>
                            )}
                        </>
                    )}
                </div>
            </main>

            {/* Terms & Conditions Modal */}
            <div
              id="termsModal"
              style={{
                display: 'none',
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                background: 'rgba(0,0,0,0.7)',
                zIndex: 1000,
              }}
            >
              <div
                style={{
                  background: '#000',
                  maxWidth: 600,
                  margin: '5% auto',
                  padding: '2rem',
                  borderRadius: 8,
                  position: 'relative',
                  maxHeight: '80vh',
                  overflowY: 'auto', // Enable scroll
                  color: '#e5e7eb', // Tailwind gray-200
                }}
              >
                <h2 style={{ color: 'rgb(129 140 248)' }}>Terms & Conditions</h2>
                <p>
                                    Welcome to ColorPickPro+Erase & Edit!<br />
                                    By using our tool, you agree to the following terms and conditions. Please read them carefully before using our service.
                                    <br />
                                    <div style={{
                                        background: '#fef3c7',
                                        border: '1px solid #f59e42',
                                        color: '#b45309',
                                        padding: '12px',
                                        borderRadius: '8px',
                                        margin: '16px 0',
                                        fontWeight: 'bold',
                                        fontSize: '1rem',
                                        boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                                    }}>
                                        <span role="alert" style={{ display: 'block', textAlign: 'center' }}>
                                            <strong>Note:</strong><br />
                                            If the object is not removed perfectly the first time, try erasing the same area multiple times.<br />
                                            Each pass improves the result and gives you a cleaner, more precise removal.
                                        </span>
                                    </div>
                </p>
                <ol>
                  <li>
                    <strong>Overview</strong>
                    <br />
                    ColorPickPro+Erase & Edit is a free-to-use online tool that allows users to:<br />
                    - Pick colors from images with precision.<br />
                    - Remove small objects from images quickly and easily.<br />
                    - Search and edit images in a simple, user-friendly interface.<br />
                    Our goal is to make image editing fast, fun, and accessible for everyone.
                  </li>
                  <li>
                    <strong>How It Works</strong>
                    <br />
                    Our tool uses AI-powered technology to edit and enhance images. While we strive to deliver high-quality results, performance may vary depending on the image and selection area:<br />
                    - Best results are achieved when removing small objects.<br />
                    - When users select large areas, results may not be perfect and could look less natural.
                  </li>
                  <li>
                    <strong>User Responsibility</strong>
                    <br />
                    By using this tool, you agree that:<br />
                    - You will only upload and edit images you have the right to use.<br />
                    - You will not use this tool for illegal, harmful, or offensive purposes.<br />
                    - You understand that results are AI-generated and may not always meet your expectations.
                  </li>
                  <li>
                    <strong>No Cost – 100% Free</strong>
                    <br />
                    Our service is completely free of charge for all users. No subscription, no hidden fees.
                  </li>
                  <li>
                    <strong>Limitations & Disclaimer</strong>
                    <br />
                    This tool is provided “as is” with no guarantees.<br />
                    We are not responsible for any issues, loss, or damages resulting from the use of this tool.<br />
                    Output quality may vary depending on your selection and image complexity.
                  </li>
                  <li>
                    <strong>Updates & Changes</strong>
                    <br />
                    We may update these Terms & Conditions from time to time to improve our service. Changes will take effect immediately once published on this page.
                  </li>
                  <li>
                    <strong>Contact</strong>
                    <br />
                    For feedback, suggestions, or issues, feel free to reach out to us. We’re always improving and love hearing from our users!
                  </li>
                </ol>
                <button
                  onClick={() => (document.getElementById('termsModal')!.style.display = 'none')}
                  style={{
                    position: 'absolute',
                    top: '1rem',
                    right: '1rem',
                    background: 'rgb(129 140 248)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '0.5rem 1rem',
                    cursor: 'pointer',
                  }}
                >
                  Close
                </button>
              </div>
            </div>
        </div>
    );
};

// --- Authentication Component ---

const LoginSignupForm: FC<{ onLoginSuccess: (user: User) => void }> = ({ onLoginSuccess }) => {
    const [isLogin, setIsLogin] = useState(true);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isFading, setIsFading] = useState(false);
    const [shake, setShake] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const handleFormError = (message: string) => {
        setError(message);
        setShake(true);
        setTimeout(() => setShake(false), 500);
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError('');

        if (!username || !password) {
            handleFormError('Username and password are required.');
            return;
        }

        setIsLoading(true);
        try {
            const user = isLogin
                ? await authService.login(username, password)
                : await authService.signup(username, password);
            onLoginSuccess(user);
        } catch (err: any) {
            handleFormError(err.message || 'An unknown error occurred.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleGoogleSignup = async () => {
        setError('');
        setIsLoading(true);
        try {
            const user = await authService.googleSignup();
            onLoginSuccess(user);
        } catch (err: any) {
            handleFormError(err.message || 'An unknown error occurred.');
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleToggleView = () => {
        if (isLoading) return;
        setIsFading(true);
        setTimeout(() => {
            setIsLogin(prev => !prev);
            setError('');
            setUsername('');
            setPassword('');
            setIsFading(false);
        }, 200);
    };
    
    const inputBaseClasses = "w-full px-4 py-3 bg-gray-700 text-white border rounded-md focus:outline-none focus:ring-2 transition-colors disabled:opacity-50";
    const inputNormalClasses = "border-gray-600 focus:ring-indigo-500";
    const inputErrorClasses = "border-red-500 focus:ring-red-500";

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
            <style>{`
                @keyframes shake {
                    10%, 90% { transform: translate3d(-1px, 0, 0); }
                    20%, 80% { transform: translate3d(2px, 0, 0); }
                    30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
                    40%, 60% { transform: translate3d(4px, 0, 0); }
                }
                .animate-shake { animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both; }
                
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(-10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-fade-in { animation: fadeIn 0.3s ease-out forwards; }
            `}</style>
            <div className={`bg-gray-800 p-8 rounded-lg shadow-xl w-full max-w-sm transition-opacity duration-200 ${isFading ? 'opacity-0' : 'opacity-100'} ${shake ? 'animate-shake' : ''}`}>
                <h2 className="text-3xl font-bold text-center text-indigo-400 mb-6 h-10 flex items-center justify-center">
                    <span key={isLogin ? 'login' : 'signup'} className="animate-fade-in">
                        {isLogin ? 'Login' : 'Sign Up'}
                    </span>
                </h2>
                
                {error && (
                    <div className="bg-red-500/20 text-red-300 p-3 rounded-md mb-4 text-sm flex items-center gap-2">
                        <Icon path={ICONS.WARNING} className="h-5 w-5" />
                        <span>{error}</span>
                    </div>
                )}
                
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1" htmlFor="username">Username</label>
                        <input
                            id="username"
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className={`${inputBaseClasses} ${error ? inputErrorClasses : inputNormalClasses}`}
                            autoComplete="username"
                            disabled={isLoading}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1" htmlFor="password">Password</label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className={`${inputBaseClasses} ${error ? inputErrorClasses : inputNormalClasses}`}
                            autoComplete={isLogin ? "current-password" : "new-password"}
                            disabled={isLoading}
                        />
                    </div>
                    <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-3 px-4 rounded-md hover:bg-indigo-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-wait" disabled={isLoading}>
                        {isLoading ? 'Processing...' : (isLogin ? 'Login' : 'Create Account')}
                    </button>
                </form>

                <div className="mt-4 flex items-center justify-center">
                    <div className="border-t border-gray-600 flex-grow"></div>
                    <span className="text-gray-500 px-2 text-sm">OR</span>
                    <div className="border-t border-gray-600 flex-grow"></div>
                </div>

                <button
                    onClick={handleGoogleSignup}
                    className="w-full mt-4 flex items-center justify-center gap-3 bg-gray-700 text-white font-bold py-3 px-4 rounded-md hover:bg-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-wait"
                    title="Simulates Google sign-up. No data is sent to Google."
                    disabled={isLoading}
                >
                    <Icon path={ICONS.GOOGLE} className="h-5 w-5"/>
                    <span>{isLoading ? 'Processing...' : 'Sign up with Google'}</span>
                </button>
                
                <p className="mt-6 text-center text-sm text-gray-400">
                    {isLogin ? "Don't have an account?" : "Already have an account?"}
                    <button onClick={handleToggleView} className="font-medium text-indigo-400 hover:underline ml-1 disabled:opacity-50" disabled={isLoading}>
                        {isLogin ? 'Sign up' : 'Login'}
                    </button>
                </p>
            </div>
        </div>
    );
};

// --- Main App Component ---
const App: FC = () => {
    const [user, setUser] = useState<User | null>(() => {
        const storedUser = sessionStorage.getItem("color-picker-user");
        return storedUser ? JSON.parse(storedUser) : null;
    });
    const [showLoginModal, setShowLoginModal] = useState(false);

    const handleLogin = (loggedInUser: User) => {
        sessionStorage.setItem("color-picker-user", JSON.stringify(loggedInUser));
        setUser(loggedInUser);
    };

    const handleLogout = () => {
        sessionStorage.removeItem("color-picker-user");
        setUser(null);
    };

    return (
        <ColorPickerApp 
            user={user} 
            onLogin={handleLogin} 
            onLogout={handleLogout} 
            showLoginModal={showLoginModal} 
            setShowLoginModal={setShowLoginModal} 
        />
    );
};

export default App;