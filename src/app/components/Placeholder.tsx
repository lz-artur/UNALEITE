import { Construction } from 'lucide-react';

interface PlaceholderProps {
  title: string;
  description: string;
}

export default function Placeholder({ title, description }: PlaceholderProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
        <Construction className="w-8 h-8 text-blue-600" />
      </div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">{title}</h2>
      <p className="text-gray-600 text-center max-w-md">{description}</p>
      <div className="mt-8 bg-white rounded-xl border border-gray-200 p-6 max-w-2xl">
        <h3 className="font-bold text-gray-900 mb-3">Funcionalidades Planejadas:</h3>
        <ul className="text-sm text-gray-700 space-y-2">
          {title === 'Custo de Produção' && (
            <>
              <li>• Cálculo automático de custos por OP</li>
              <li>• Custo de leite, insumos e embalagens</li>
              <li>• Custos indiretos: energia, lenha e mão de obra</li>
              <li>• Custo unitário por kg/unidade</li>
            </>
          )}
          {title === 'Comercial e Expedição' && (
            <>
              <li>• Criar pedidos de venda</li>
              <li>• Seleção de produtos com base na validade (FEFO)</li>
              <li>• Registro de temperatura do transporte</li>
              <li>• Baixa automática do estoque na expedição</li>
            </>
          )}
          {title === 'Folha do Leite' && (
            <>
              <li>• Cálculo de pagamento por produtor</li>
              <li>• Preço base por litro entregue</li>
              <li>• Bônus por gordura e proteína</li>
              <li>• Penalização por qualidade (acidez, CBT)</li>
            </>
          )}
          {title === 'DRE Gerencial' && (
            <>
              <li>• Faturamento total por período</li>
              <li>• Custo de produção consolidado</li>
              <li>• Margem de contribuição</li>
              <li>• Análise por linha de produto</li>
            </>
          )}
          {title === 'Cadastros' && (
            <>
              <li>• Produtores, Transportadores e Rotas</li>
              <li>• Produtos e Insumos</li>
              <li>• Fornecedores e Clientes</li>
              <li>• Tabelas de preços e usuários</li>
            </>
          )}
        </ul>
      </div>
    </div>
  );
}
