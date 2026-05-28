import React, { useRef, useState, useEffect } from 'react';

interface ProgressBarProps {
  value: number;
  max: number;
  onChange: (value: number) => void;
  accentColor?: string;
  showTimeLabels?: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  max,
  onChange,
  accentColor = '#38bdf8',
  showTimeLabels = true,
}) => {
  const [localValue, setLocalValue] = useState(value);
  const [isDragging, setIsDragging] = useState(false);
  const sliderRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isDragging) {
      setLocalValue(value);
    }
  }, [value, isDragging]);

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds === Infinity) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setLocalValue(val);
    if (!isDragging) {
      onChange(val);
    }
  };

  const handleMouseDown = () => {
    setIsDragging(true);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    onChange(localValue);
  };

  const progressPercent = max > 0 ? (localValue / max) * 100 : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      <div 
        style={{ 
          position: 'relative', 
          display: 'flex', 
          alignItems: 'center', 
          width: '100%',
          height: 16,
          cursor: 'pointer'
        }}
      >
        <input
          ref={sliderRef}
          type="range"
          min={0}
          max={max || 100}
          value={localValue}
          onChange={handleChange}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onTouchStart={handleMouseDown}
          onTouchEnd={handleMouseUp}
          className="premium-slider"
          style={{
            background: `linear-gradient(to right, ${accentColor} 0%, ${accentColor} ${progressPercent}%, rgba(255, 255, 255, 0.1) ${progressPercent}%, rgba(255, 255, 255, 0.1) 100%)`,
          }}
        />
      </div>
      {showTimeLabels && (
        <div 
          style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            fontSize: 10, 
            color: '#64748b', 
            fontFamily: 'monospace',
            marginTop: 4,
            userSelect: 'none'
          }}
        >
          <span>{formatTime(localValue)}</span>
          <span>{formatTime(max)}</span>
        </div>
      )}
    </div>
  );
};
