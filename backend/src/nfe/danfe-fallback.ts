/* eslint-disable @typescript-eslint/no-require-imports */
const PDFDocument = require('pdfkit');
const bwipjs = require('bwip-js');
const { parseStringPromise, processors } = require('xml2js');

type XmlRecord = Record<string, any>;

const mm = (value: number) => value * 2.834645669;
const pageWidth = mm(210);
const margin = mm(8);
const contentWidth = pageWidth - margin * 2;

function value(input: unknown) {
  return input === undefined || input === null ? '' : String(input);
}

function list<T>(input: T | T[] | undefined): T[] {
  if (input === undefined) return [];
  return Array.isArray(input) ? input : [input];
}

function digits(input: unknown) {
  return value(input).replace(/\D/g, '');
}

function documentNumber(input: unknown) {
  const number = digits(input);
  if (number.length === 14) return `${number.slice(0, 2)}.${number.slice(2, 5)}.${number.slice(5, 8)}/${number.slice(8, 12)}-${number.slice(12)}`;
  if (number.length === 11) return `${number.slice(0, 3)}.${number.slice(3, 6)}.${number.slice(6, 9)}-${number.slice(9)}`;
  return number;
}

function money(input: unknown) {
  const number = Number(input ?? 0);
  return number.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function quantity(input: unknown) {
  const number = Number(input ?? 0);
  return number.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function dateTime(input: unknown) {
  const raw = value(input);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2}:\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]} ${match[4]}` : raw;
}

function firstObject(record: XmlRecord | undefined) {
  if (!record) return {};
  const key = Object.keys(record).find((entry) => entry !== '$');
  return key ? record[key] : {};
}

function getNfe(parsed: XmlRecord) {
  const process = parsed.nfeProc ?? parsed;
  const nfe = process.NFe ?? process.nfeProc?.NFe;
  const protocol = process.protNFe?.infProt ?? {};
  if (!nfe?.infNFe) throw new Error('O XML não contém uma NF-e processada válida.');
  return { info: nfe.infNFe as XmlRecord, protocol: protocol as XmlRecord };
}

function box(doc: any, x: number, y: number, width: number, height: number, label: string, content: string, options: { align?: string; bold?: boolean; size?: number } = {}) {
  doc.lineWidth(0.5).rect(x, y, width, height).stroke('#111111');
  doc.font('Helvetica').fontSize(5.5).fillColor('#444444').text(label.toUpperCase(), x + 4, y + 3, { width: width - 8, height: 8 });
  doc.font(options.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(options.size ?? 8).fillColor('#111111')
    .text(content || '', x + 4, y + 13, { width: width - 8, height: height - 15, align: options.align ?? 'left', ellipsis: true });
}

function section(doc: any, y: number, title: string) {
  doc.save().fillColor('#eef0f2').rect(margin, y, contentWidth, 14).fill().restore();
  doc.lineWidth(0.5).rect(margin, y, contentWidth, 14).stroke('#111111');
  doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#111111').text(title.toUpperCase(), margin + 4, y + 4);
  return y + 14;
}

function watermark(doc: any, homologation: boolean) {
  if (!homologation) return;
  doc.save().fillColor('#d9d9d9').font('Helvetica-Bold').fontSize(38).opacity(0.55)
    .rotate(-38, { origin: [pageWidth / 2, mm(148)] })
    .text('SEM VALOR FISCAL', mm(35), mm(135), { width: mm(140), align: 'center' })
    .restore();
}

export async function generateFallbackDanfe(xml: string, accessKey?: string): Promise<Buffer> {
  if (!xml || !/<(?:\w+:)?NFe[\s>]/i.test(xml)) throw new Error('XML autorizado não informado para gerar o DANFE.');
  const parsed = await parseStringPromise(xml, {
    explicitArray: false,
    tagNameProcessors: [processors.stripPrefix],
    attrkey: '$',
    trim: true,
  });
  const { info, protocol } = getNfe(parsed);
  const ide = info.ide ?? {};
  const emit = info.emit ?? {};
  const emitAddress = emit.enderEmit ?? {};
  const recipient = info.dest ?? {};
  const recipientAddress = recipient.enderDest ?? {};
  const totals = info.total?.ICMSTot ?? {};
  const transport = info.transp ?? {};
  const payment = firstObject(info.pag?.detPag ? { detPag: info.pag.detPag } : undefined);
  const key = accessKey || value(protocol.chNFe) || value(info.$?.Id).replace(/^NFe/, '');
  const homologation = String(ide.tpAmb) === '2';

  const doc = new PDFDocument({ size: 'A4', margin: 0, compress: true, info: { Title: `DANFE NF-e ${value(ide.nNF)}` } });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const complete = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  watermark(doc, homologation);
  let y = margin;

  box(doc, margin, y, contentWidth, 37, 'Recebimento', `RECEBEMOS DE ${value(emit.xNome)} OS PRODUTOS CONSTANTES DA NF-e INDICADA`, { size: 7 });
  doc.font('Helvetica-Bold').fontSize(10).text(`NF-e Nº ${value(ide.nNF)}  SÉRIE ${value(ide.serie)}`, pageWidth - margin - 155, y + 19, { width: 148, align: 'right' });
  y += 42;

  const issuerWidth = mm(92);
  const danfeWidth = mm(30);
  const keyWidth = contentWidth - issuerWidth - danfeWidth;
  box(doc, margin, y, issuerWidth, 105, 'Emitente', `${value(emit.xNome)}\n${value(emitAddress.xLgr)}, ${value(emitAddress.nro)} - ${value(emitAddress.xBairro)}\n${value(emitAddress.xMun)}/${value(emitAddress.UF)} - CEP ${digits(emitAddress.CEP)}\nCNPJ ${documentNumber(emit.CNPJ)}  IE ${value(emit.IE)}`, { bold: true, size: 8 });
  box(doc, margin + issuerWidth, y, danfeWidth, 105, 'Documento auxiliar', `DANFE\n\n${String(ide.tpNF) === '0' ? '0 - ENTRADA' : '1 - SAÍDA'}\n\nNº ${value(ide.nNF)}\nSÉRIE ${value(ide.serie)}`, { align: 'center', bold: true, size: 9 });
  const keyBoxX = margin + issuerWidth + danfeWidth;
  box(doc, keyBoxX, y, keyWidth, 105, 'Chave de acesso', '', { align: 'center' });
  doc.font('Helvetica-Bold').fontSize(7).fillColor('#111111')
    .text(key.replace(/(.{4})/g, '$1 ').trim(), keyBoxX + 4, y + 13, { width: keyWidth - 8, align: 'center' });
  try {
    const barcode = await bwipjs.toBuffer({ bcid: 'code128', text: key, scale: 1.3, height: 8, includetext: false, padding: 0 });
    doc.image(barcode, keyBoxX + 8, y + 27, { fit: [keyWidth - 16, 30], align: 'center' });
  } catch {
    // A chave impressa mantém o DANFE utilizável mesmo se o código de barras falhar.
  }
  doc.font('Helvetica').fontSize(6).fillColor('#111111')
    .text('Consulta de autenticidade no portal nacional da NF-e', keyBoxX + 4, y + 63, { width: keyWidth - 8, align: 'center' });
  if (homologation) doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#a00000').text('HOMOLOGAÇÃO - SEM VALOR FISCAL', margin + issuerWidth + danfeWidth + 4, y + 88, { width: keyWidth - 8, align: 'center' });
  y += 105;

  box(doc, margin, y, mm(115), 30, 'Natureza da operação', value(ide.natOp), { bold: true, size: 8 });
  box(doc, margin + mm(115), y, contentWidth - mm(115), 30, 'Protocolo de autorização', `${value(protocol.nProt)} - ${dateTime(protocol.dhRecbto)}`, { bold: true, size: 7 });
  y += 30;
  box(doc, margin, y, mm(70), 27, 'Inscrição estadual', value(emit.IE), { size: 8 });
  box(doc, margin + mm(70), y, mm(55), 27, 'Inscrição estadual do substituto', value(emit.IEST), { size: 8 });
  box(doc, margin + mm(125), y, contentWidth - mm(125), 27, 'CNPJ', documentNumber(emit.CNPJ), { bold: true, size: 8 });
  y += 27;

  y = section(doc, y, 'Destinatário / Remetente');
  box(doc, margin, y, mm(119), 31, 'Nome / Razão social', value(recipient.xNome), { bold: true, size: 7.5 });
  box(doc, margin + mm(119), y, mm(43), 31, 'CNPJ / CPF', documentNumber(recipient.CNPJ ?? recipient.CPF), { size: 8 });
  box(doc, margin + mm(162), y, contentWidth - mm(162), 31, 'Data da emissão', dateTime(ide.dhEmi).slice(0, 10), { size: 8 });
  y += 31;
  box(doc, margin, y, mm(92), 29, 'Endereço', `${value(recipientAddress.xLgr)}, ${value(recipientAddress.nro)}`, { size: 7.5 });
  box(doc, margin + mm(92), y, mm(42), 29, 'Bairro / Distrito', value(recipientAddress.xBairro), { size: 7 });
  box(doc, margin + mm(134), y, mm(28), 29, 'CEP', digits(recipientAddress.CEP), { size: 8 });
  box(doc, margin + mm(162), y, contentWidth - mm(162), 29, 'Saída / Entrada', dateTime(ide.dhEmi).slice(0, 10), { size: 8 });
  y += 29;
  box(doc, margin, y, mm(76), 29, 'Município', value(recipientAddress.xMun), { size: 8 });
  box(doc, margin + mm(76), y, mm(17), 29, 'UF', value(recipientAddress.UF), { align: 'center', size: 8 });
  box(doc, margin + mm(93), y, mm(41), 29, 'Fone / Fax', value(recipientAddress.fone), { size: 7.5 });
  box(doc, margin + mm(134), y, mm(28), 29, 'Inscrição estadual', value(recipient.IE), { size: 7 });
  box(doc, margin + mm(162), y, contentWidth - mm(162), 29, 'Hora saída / entrada', dateTime(ide.dhEmi).slice(11), { size: 8 });
  y += 29;

  y = section(doc, y, 'Dados dos produtos / serviços');
  const columns = [
    ['Código', 40], ['Descrição', 125], ['NCM/SH', 43], ['CST', 26], ['CFOP', 31], ['UN', 23],
    ['Quantidade', 40], ['Valor unit.', 48], ['Valor total', 48], ['BC ICMS', 45], ['V. ICMS', 45], ['Alíq.', 36],
  ] as const;
  const headerHeight = 23;
  let x = margin;
  for (const [label, width] of columns) {
    box(doc, x, y, width, headerHeight, '', label, { align: 'center', bold: true, size: 5 });
    x += width;
  }
  y += headerHeight;
  for (const item of list<XmlRecord>(info.det)) {
    if (y > mm(244)) {
      doc.addPage(); watermark(doc, homologation); y = margin;
      y = section(doc, y, 'Continuação dos produtos / serviços');
    }
    const product = item.prod ?? {};
    const icms = firstObject(item.imposto?.ICMS);
    const cells = [
      value(product.cProd), value(product.xProd), value(product.NCM), value(icms.CST ?? icms.CSOSN), value(product.CFOP), value(product.uCom),
      quantity(product.qCom), money(product.vUnCom), money(product.vProd), money(icms.vBC), money(icms.vICMS), money(icms.pICMS),
    ];
    x = margin;
    const rowHeight = Math.max(27, Math.ceil(value(product.xProd).length / 35) * 8 + 13);
    cells.forEach((cell, index) => {
      box(doc, x, y, columns[index][1], rowHeight, '', cell, { align: index >= 6 ? 'right' : 'left', size: 5.7 });
      x += columns[index][1];
    });
    y += rowHeight;
  }

  y = section(doc, y, 'Cálculo do imposto');
  const taxFields = [
    ['Base de cálculo do ICMS', totals.vBC], ['Valor do ICMS', totals.vICMS], ['Base de cálculo do ICMS ST', totals.vBCST], ['Valor do ICMS ST', totals.vST], ['Valor total dos produtos', totals.vProd],
    ['Valor do frete', totals.vFrete], ['Valor do seguro', totals.vSeg], ['Desconto', totals.vDesc], ['Outras despesas', totals.vOutro], ['Valor total da NF-e', totals.vNF],
  ];
  const taxWidth = contentWidth / 5;
  taxFields.forEach(([label, amount], index) => box(doc, margin + (index % 5) * taxWidth, y + Math.floor(index / 5) * 27, taxWidth, 27, value(label), `R$ ${money(amount)}`, { align: 'right', bold: index === 9, size: 7.5 }));
  y += 54;

  y = section(doc, y, 'Transportador / Volumes transportados');
  const freightModes: Record<string, string> = { '0': '0 - Emitente', '1': '1 - Destinatário', '2': '2 - Terceiros', '9': '9 - Sem frete' };
  box(doc, margin, y, mm(90), 28, 'Nome / Razão social', value(transport.transporta?.xNome), { size: 7 });
  box(doc, margin + mm(90), y, mm(54), 28, 'Modalidade do frete', freightModes[value(transport.modFrete)] ?? value(transport.modFrete), { size: 7 });
  box(doc, margin + mm(144), y, contentWidth - mm(144), 28, 'CNPJ / CPF', documentNumber(transport.transporta?.CNPJ ?? transport.transporta?.CPF), { size: 7 });
  y += 28;

  const paymentNames: Record<string, string> = { '01': 'Dinheiro', '03': 'Cartão de crédito', '04': 'Cartão de débito', '15': 'Boleto bancário', '17': 'PIX', '90': 'Sem pagamento', '99': 'Outros' };
  box(doc, margin, y, mm(100), 28, 'Forma de pagamento', paymentNames[value(payment.tPag)] ?? value(payment.tPag), { size: 8 });
  box(doc, margin + mm(100), y, contentWidth - mm(100), 28, 'Valor do pagamento', `R$ ${money(payment.vPag)}`, { align: 'right', bold: true, size: 9 });
  y += 28;

  y = section(doc, y, 'Dados adicionais');
  box(doc, margin, y, mm(135), 57, 'Informações complementares', value(info.infAdic?.infCpl) || (homologation ? 'Documento emitido em ambiente de homologação. Sem valor fiscal.' : ''), { size: 6.5 });
  box(doc, margin + mm(135), y, contentWidth - mm(135), 57, 'Reservado ao fisco', `Status SEFAZ: ${value(protocol.cStat)} - ${value(protocol.xMotivo)}\nProtocolo: ${value(protocol.nProt)}`, { size: 6.3 });

  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    doc.font('Helvetica').fontSize(5.5).fillColor('#333333').text(`Chave: ${key} | Página ${index + 1}/${range.count}`, margin, mm(291), { width: contentWidth, align: 'right' });
    if (homologation) doc.font('Helvetica-Bold').fontSize(8).fillColor('#a00000').text('NF-e EMITIDA EM AMBIENTE DE HOMOLOGAÇÃO - SEM VALOR FISCAL', margin, mm(286), { width: contentWidth, align: 'center' });
  }

  doc.end();
  return complete;
}
