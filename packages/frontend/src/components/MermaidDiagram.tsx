import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

interface MermaidDiagramProps {
  chart: string;
  className?: string;
}

// Mermaidの初期化（一度だけ実行）
let isInitialized = false;

// IDカウンター（ランダムではなく連番）
let idCounter = 0;

export const MermaidDiagram: React.FC<MermaidDiagramProps> = ({ chart, className = '' }) => {
  const mermaidRef = useRef<HTMLDivElement>(null);
  const chartId = useRef(`mermaid-${++idCounter}`);
  const [isValidSyntax, setIsValidSyntax] = useState<boolean | null>(null);
  const debounceTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!isInitialized) {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'loose',
        fontFamily: 'inherit',
        fontSize: 14,
        flowchart: {
          htmlLabels: true,
          curve: 'basis',
        },
        sequence: {
          diagramMarginX: 50,
          diagramMarginY: 10,
          actorMargin: 50,
          width: 150,
          height: 65,
          boxMargin: 10,
          boxTextMargin: 5,
          noteMargin: 10,
          messageMargin: 35,
        },
        gantt: {
          titleTopMargin: 25,
          barHeight: 20,
          fontSize: 12,
          gridLineStartPadding: 35,
        },
      });
      isInitialized = true;
    }
  }, []);

  useEffect(() => {
    // 前のタイマーをクリア
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const renderChart = async () => {
      if (!mermaidRef.current || !chart.trim()) {
        setIsValidSyntax(null);
        return;
      }

      try {
        // まず構文チェックを行う
        await mermaid.parse(chart);
        setIsValidSyntax(true);

        // 構文が有効な場合のみレンダリング
        mermaidRef.current.innerHTML = '';
        const { svg } = await mermaid.render(chartId.current, chart);
        mermaidRef.current.innerHTML = svg;
      } catch {
        // 構文エラーの場合は静かに失敗（表示しない）
        setIsValidSyntax(false);
        if (mermaidRef.current) {
          mermaidRef.current.innerHTML = '';
        }
      }
    };

    // Debounce処理: 300ms待ってからレンダリングを実行
    debounceTimerRef.current = setTimeout(renderChart, 300);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [chart]);

  return (
    <div
      ref={mermaidRef}
      className={`mermaid-diagram overflow-x-auto my-4 ${className}`}
      style={{
        // Mermaid SVGのスタイル調整
        fontSize: 'inherit',
        fontFamily: 'inherit',
        minHeight: isValidSyntax === null ? '20px' : undefined,
      }}
    >
      {/* ストリーム処理中で構文が不完全な場合のプレースホルダー */}
      {isValidSyntax === false && chart.trim() && (
        <div className="text-gray-400 text-sm italic py-2">Mermaid diagram loading...</div>
      )}
    </div>
  );
};
