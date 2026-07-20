import React, { useState } from 'react';
import { X, Upload, Loader2, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

interface BaixaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (file: File) => Promise<void>;
}

export default function BaixaModal({ isOpen, onClose, onConfirm }: BaixaModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      toast.error('O comprovante é obrigatório para realizar a baixa.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onConfirm(file);
      setFile(null);
      onClose();
    } catch (error) {
      console.error(error);
      // Erro é tratado pelo componente pai que chama onConfirm
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="flex justify-between items-center p-6 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <h2 className="text-xl font-semibold text-gray-800">Confirmar Baixa</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6">
          <p className="text-sm text-gray-600 mb-6">
            Para marcar este lançamento como pago, é obrigatório anexar o comprovante da operação.
          </p>
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Comprovante <span className="text-red-500">*</span>
            </label>
            <label className="cursor-pointer flex flex-col items-center justify-center gap-2 bg-gray-50 border border-gray-300 rounded-lg p-6 hover:bg-gray-100 transition-colors text-sm font-medium text-gray-700 border-dashed">
              <Upload className="w-6 h-6 text-gray-400" />
              {file ? (
                <span className="text-blue-600 break-all text-center">{file.name}</span>
              ) : (
                <span className="text-center text-gray-500">Clique para selecionar o arquivo<br/>(PDF ou Imagem)</span>
              )}
              <input 
                type="file" 
                className="hidden" 
                accept=".pdf,image/*"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setFile(e.target.files[0]);
                  }
                }}
              />
            </label>
          </div>
          
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !file}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 focus:outline-none disabled:bg-green-400 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Confirmar Baixa
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
