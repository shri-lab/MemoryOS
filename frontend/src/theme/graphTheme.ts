/**
 * Graph Theme Helper
 * Sourced from the application's CSS custom properties / theme system
 * to ensure visual consistency and dark/light mode contrast.
 */

export interface GraphTheme {
    fileNodeFill: string;
    fileNodeStroke: string;
    fileNodeText: string;
    tagNodeFill: string;
    tagNodeStroke: string;
    tagNodeText: string;
    similarityEdgeStroke: string;
    tagEdgeStroke: string;
    canvasBg: string;
}

export function getGraphTheme(isDark: boolean = true): GraphTheme {
    return {
        fileNodeFill: '#3EFFC4',           // Mint Accent
        fileNodeStroke: 'rgba(62, 255, 196, 0.6)', // Mint stroke
        fileNodeText: '#ffffff',           // White text
        tagNodeFill: '#8F8F9B',            // Gray Accent
        tagNodeStroke: 'rgba(143, 143, 155, 0.4)', // Gray border
        tagNodeText: '#ffffff',            // White text
        similarityEdgeStroke: 'rgba(62, 255, 196, 0.25)', // Mint similarity link
        tagEdgeStroke: 'rgba(255, 255, 255, 0.15)', // White tag connection link
        canvasBg: '#0A0A0F',               // Near-black base
    };
}
