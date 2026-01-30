import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { renderMermaid } from 'beautiful-mermaid';

interface MermaidDiagramProps {
  chart: string;
  className?: string;
}

const MermaidDiagramComponent: React.FC<MermaidDiagramProps> = ({ chart, className = '' }) => {
  const { t } = useTranslation();
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [isValidSyntax, setIsValidSyntax] = useState<boolean | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const debounceTimerRef = useRef<number | undefined>(undefined);
  const currentChartRef = useRef<string>('');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // Clear previous timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const renderChart = async () => {
      // Stop processing if component unmounted
      if (!mountedRef.current || !chart.trim()) {
        if (mountedRef.current) {
          setIsValidSyntax(null);
          setSvgContent(null);
        }
        return;
      }

      // Skip if same as current chart (prevent infinite rendering)
      if (currentChartRef.current === chart.trim()) {
        return;
      }

      currentChartRef.current = chart.trim();
      setIsRendering(true);

      try {
        // Render with beautiful-mermaid
        const svg = await renderMermaid(chart, {
          bg: '#ffffff',
          fg: '#333333',
        });

        // Check if still mounted after rendering
        if (!mountedRef.current) {
          return;
        }

        setIsValidSyntax(true);
        setSvgContent(svg);
      } catch (error) {
        // If error occurs
        console.warn('Mermaid rendering error:', error);

        if (mountedRef.current) {
          setIsValidSyntax(false);
          setSvgContent(null);
        }
      } finally {
        if (mountedRef.current) {
          setIsRendering(false);
        }
      }
    };

    // Debounce: Execute rendering after 100ms wait
    debounceTimerRef.current = window.setTimeout(renderChart, 100);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [chart]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return (
    <div
      className={`mermaid-diagram overflow-x-auto my-4 ${className}`}
      style={{
        fontSize: 'inherit',
        fontFamily: 'inherit',
        minHeight: isValidSyntax === null ? '20px' : undefined,
      }}
    >
      {/* Loading */}
      {isRendering && (
        <div className="text-blue-500 text-sm italic py-2">{t('common.renderingDiagram')}</div>
      )}

      {/* Syntax error */}
      {isValidSyntax === false && chart.trim() && !isRendering && (
        <div className="text-gray-400 text-sm italic py-2">{t('common.diagramLoading')}</div>
      )}

      {/* SVG content */}
      {svgContent && !isRendering && (
        <div className="mermaid-svg-container" dangerouslySetInnerHTML={{ __html: svgContent }} />
      )}
    </div>
  );
};

// Wrap with React.memo to prevent re-renders unless props change
export const MermaidDiagram = React.memo(MermaidDiagramComponent);
