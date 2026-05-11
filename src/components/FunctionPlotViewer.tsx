import React, { useState, useRef, useEffect } from 'react';

interface SpecialPoint {
  x: number;
  y: number;
  type: 'open' | 'filled' | 'arrow';
  label?: string;
}

interface PlotData {
  image_base64?: string;
  image_url?: string;
  metadata?: {
    function: string;
    title: string;
    x_range: [number, number];
    has_special_points?: boolean;
    discontinuity_type?: string;
  };
}

interface FunctionPlotViewerProps {
  plotData: PlotData | null;
  isLoading?: boolean;
  onDownload?: () => void;
  className?: string;
}

export function FunctionPlotViewer({
  plotData,
  isLoading = false,
  onDownload,
  className = ''
}: FunctionPlotViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showAnnotations, setShowAnnotations] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (plotData) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
  }, [plotData]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prev => Math.min(Math.max(prev * delta, 0.5), 5));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const downloadImage = () => {
    if (!plotData?.image_base64 && !plotData?.image_url) return;

    const link = document.createElement('a');
    if (plotData.image_base64) {
      link.href = `data:image/png;base64,${plotData.image_base64}`;
    } else if (plotData.image_url) {
      link.href = `http://localhost:8000/${plotData.image_url}`;
    }
    const title = plotData.metadata?.title || 'function_plot';
    link.download = `${title.replace(/\s+/g, '_')}.png`;
    link.click();
    
    if (onDownload) onDownload();
  };

  if (isLoading) {
    return (
      <div className={`w-full bg-white/5 border border-white/10 rounded-lg p-8 ${className}`}>
        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
          <div className="text-center">
            <p className="text-white font-medium">正在生成函数图像...</p>
            <p className="text-gray-400 text-sm mt-1">支持分段函数、间断点标注</p>
          </div>
          <div className="flex flex-wrap gap-2 mt-4 justify-center">
            {['连续函数', '可去间断点', '跳跃间断点', '无穷间断点'].map((type) => (
              <span key={type} className="px-3 py-1 bg-indigo-500/20 text-indigo-300 rounded-full text-xs">
                {type}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!plotData) {
    return (
      <div className={`w-full bg-white/5 border border-dashed border-white/20 rounded-lg p-12 ${className}`}>
        <div className="flex flex-col items-center justify-center text-gray-400">
          <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="font-medium">等待生成图像</p>
          <p className="text-sm mt-1">发送绘图指令后，图像将在此处显示</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow-xl overflow-hidden ${className}`}>
      {/* 标题栏 */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
          </svg>
          <h3 className="text-white font-semibold text-sm">
            {plotData.metadata?.title || '函数图像'}
          </h3>
        </div>

        {/* 控制按钮组 */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowAnnotations(!showAnnotations)}
            className="p-1.5 hover:bg-white/20 rounded transition-colors"
            title={showAnnotations ? '隐藏标注' : '显示标注'}
          >
            <svg className={`w-4 h-4 text-white ${showAnnotations ? '' : 'opacity-50'}`}
                 fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
          </button>

          <button
            onClick={resetView}
            className="p-1.5 hover:bg-white/20 rounded transition-colors"
            title="重置视图"
          >
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>

          <button
            onClick={downloadImage}
            className="p-1.5 hover:bg-white/20 rounded transition-colors"
            title="下载图像"
          >
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>

          <div className="w-px h-5 bg-white/30 mx-1"></div>

          <span className="text-white/80 text-xs font-mono">
            {(zoom * 100).toFixed(0)}%
          </span>
        </div>
      </div>

      {/* 图像显示区域 - 支持交互操作 */}
      <div
        ref={containerRef}
        className="relative overflow-hidden cursor-grab active:cursor-grabbing"
        style={{ height: '500px' }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transition: isDragging ? 'none' : 'transform 0.2s ease-out'
          }}
        >
          {/* 图像主体 */}
          {plotData.image_base64 ? (
            <img
              src={`data:image/png;base64,${plotData.image_base64}`}
              alt={plotData.metadata?.title || 'Function Plot'}
              className="max-w-full max-h-full object-contain shadow-lg"
              draggable={false}
            />
          ) : plotData.image_url ? (
            <img
              src={`http://localhost:8000/${plotData.image_url}`}
              alt={plotData.metadata?.title || 'Function Plot'}
              className="max-w-full max-h-full object-contain shadow-lg"
              draggable={false}
            />
          ) : null}

          {/* 特殊点标注层（如果启用） */}
          {showAnnotations && plotData.metadata?.has_special_points && (
            <div className="absolute top-4 left-4 space-y-2">
              <div className="flex items-center space-x-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg">
                <span className="w-3 h-3 rounded-full border-2 border-red-500 bg-white"></span>
                <span className="text-xs text-red-700 font-medium">空心点 ○ (极限值)</span>
              </div>
              <div className="flex items-center space-x-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg">
                <span className="w-3 h-3 rounded-full bg-green-500 border-2 border-green-700"></span>
                <span className="text-xs text-green-700 font-medium">实心点 ● (函数值)</span>
              </div>
            </div>
          )}
        </div>

        {/* 缩放提示 */}
        <div className="absolute bottom-4 right-4 flex items-center space-x-2 bg-black/60 backdrop-blur-sm text-white px-3 py-1.5 rounded-lg text-xs">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
          </svg>
          <span>滚轮缩放 | 拖拽平移</span>
        </div>
      </div>

      {/* 元数据信息栏 */}
      <div className="bg-gray-50 px-4 py-3 border-t border-gray-200">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center space-x-4">
            <span className="text-gray-600">
              函数: <code className="text-indigo-600 font-mono">{plotData.metadata?.function}</code>
            </span>
            {plotData.metadata?.x_range && (
              <span className="text-gray-600">
                范围: [{plotData.metadata.x_range[0]}, {plotData.metadata.x_range[1]}]
              </span>
            )}
          </div>

          {plotData.metadata?.discontinuity_type && (
            <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded-md text-xs font-medium">
              {plotData.metadata.discontinuity_type === 'removable' ? '可去间断点' :
               plotData.metadata.discontinuity_type === 'jump' ? '跳跃间断点' :
               '间断点'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}


// 简化版组件：用于内嵌在对话消息中
export function InlinePlotViewer({ imageUrl, alt }: { imageUrl: string; alt?: string }) {
  const [showFull, setShowFull] = useState(false);

  return (
    <>
      <div
        className="inline-block my-2 cursor-pointer group relative"
        onClick={() => setShowFull(true)}
      >
        <img
          src={imageUrl.startsWith('data:') ? imageUrl : `http://localhost:8000/${imageUrl}`}
          alt={alt || '函数图像'}
          className="max-w-full max-h-80 rounded-lg shadow-md border border-gray-200 
                     transition-transform group-hover:scale-[1.02] group-hover:shadow-xl"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 rounded-lg 
                    transition-colors pointer-events-none"></div>
        <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="px-2 py-1 bg-black/70 text-white text-xs rounded">
            点击放大
          </span>
        </div>
      </div>

      {/* 全屏查看模态框 */}
      {showFull && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setShowFull(false)}
        >
          <div className="relative max-w-6xl max-h-screen">
            <button
              className="absolute -top-10 right-0 text-white hover:text-gray-300"
              onClick={() => setShowFull(false)}
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <img
              src={imageUrl.startsWith('data:') ? imageUrl : `http://localhost:8000/${imageUrl}`}
              alt={alt || '函数图像 (全屏)'}
              className="max-w-full max-h-screen object-contain rounded-lg shadow-2xl"
            />
          </div>
        </div>
      )}
    </>
  );
}


// 图像类型选择器（用于教学场景）
export type DiscontinuityType = 'continuous' | 'removable' | 'jump' | 'infinite';

interface PlotTypeSelectorProps {
  selectedType: DiscontinuityType;
  onSelect: (type: DiscontinuityType) => void;
}

export function PlotTypeSelector({ selectedType, onSelect }: PlotTypeSelectorProps) {
  const types: { value: DiscontinuityType; label: string; desc: string; icon: string }[] = [
    {
      value: 'continuous',
      label: '连续函数',
      desc: 'f(x)=sin(x)',
      icon: '📈'
    },
    {
      value: 'removable',
      label: '可去间断点',
      desc: 'f(x)={x²,x≠2;1,x=2}',
      icon: '⭕'
    },
    {
      value: 'jump',
      label: '跳跃间断点',
      desc: 'sgn(x) 在x=0',
      icon: '↗️'
    },
    {
      value: 'infinite',
      label: '无穷间断点',
      desc: 'f(x)=1/x 在x=0',
      icon: '∞'
    }
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {types.map(({ value, label, desc, icon }) => (
        <button
          key={value}
          onClick={() => onSelect(value)}
          className={`p-3 rounded-lg border-2 transition-all ${
            selectedType === value
              ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
              : 'border-gray-200 bg-white text-gray-700 hover:border-indigo-300 hover:bg-indigo-50/50'
          }`}
        >
          <div className="text-2xl mb-1">{icon}</div>
          <div className="font-semibold text-sm">{label}</div>
          <div className="text-xs text-gray-500 mt-0.5 font-mono">{desc}</div>
        </button>
      ))}
    </div>
  );
}

export default FunctionPlotViewer;
