'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';

interface UploadZoneProps {
  label: string;
  file: File | null;
  onFile: (f: File) => void;
}

export function UploadZone({ label, file, onFile }: UploadZoneProps) {
  const [dragOver, setDragOver] = useState(false);

  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted[0]) onFile(accepted[0]);
    },
    [onFile]
  );

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    onDragEnter: () => setDragOver(true),
    onDragLeave: () => setDragOver(false),
    onDropAccepted: () => setDragOver(false),
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
      'image/tiff': ['.tiff', '.tif'],
    },
    maxFiles: 1,
  });

  return (
    <div
      {...getRootProps()}
      className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
        dragOver
          ? 'border-amber-400 bg-amber-50'
          : file
          ? 'border-green-400 bg-green-50'
          : 'border-stone-300 hover:border-stone-400 bg-white'
      }`}
    >
      <input {...getInputProps()} />
      {file ? (
        <div className="space-y-1">
          <div className="text-2xl">📄</div>
          <div className="text-sm font-medium text-stone-700 truncate max-w-[200px] mx-auto">{file.name}</div>
          <div className="text-xs text-stone-400">{(file.size / 1024).toFixed(1)} KB · Click to replace</div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-3xl text-stone-300">⬆</div>
          <div className="text-sm font-medium text-stone-700">{label}</div>
          <div className="text-xs text-stone-400">PDF, DOCX, or image (JPG, PNG, TIFF) · drag & drop or click</div>
        </div>
      )}
    </div>
  );
}
