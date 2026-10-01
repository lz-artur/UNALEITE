from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether, PageBreak
)

OUTPUT = "output/pdf/relatorio_origem_contas_receber_VEN-2026-1790082660528.pdf"

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(
    name="ReportTitle", parent=styles["Title"], fontName="Helvetica-Bold",
    fontSize=19, leading=24, textColor=colors.HexColor("#17365D"), alignment=TA_LEFT,
    spaceAfter=7,
))
styles.add(ParagraphStyle(
    name="SubTitle", parent=styles["Normal"], fontName="Helvetica",
    fontSize=9.5, leading=13, textColor=colors.HexColor("#5B6573"), spaceAfter=13,
))
styles.add(ParagraphStyle(
    name="Section", parent=styles["Heading2"], fontName="Helvetica-Bold",
    fontSize=12, leading=15, textColor=colors.HexColor("#17365D"),
    spaceBefore=12, spaceAfter=6,
))
styles.add(ParagraphStyle(
    name="BodyReport", parent=styles["BodyText"], fontName="Helvetica",
    fontSize=9.5, leading=14, textColor=colors.HexColor("#242B35"), spaceAfter=7,
))
styles.add(ParagraphStyle(
    name="Cell", parent=styles["BodyText"], fontName="Helvetica",
    fontSize=8.2, leading=10.5, textColor=colors.HexColor("#242B35"),
))
styles.add(ParagraphStyle(
    name="CellBold", parent=styles["BodyText"], fontName="Helvetica-Bold",
    fontSize=8.2, leading=10.5, textColor=colors.HexColor("#242B35"),
))
styles.add(ParagraphStyle(
    name="Callout", parent=styles["BodyText"], fontName="Helvetica-Oblique",
    fontSize=8.7, leading=12.5, textColor=colors.HexColor("#344455"),
))

def P(text, style="BodyReport"):
    return Paragraph(text, styles[style])

def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#D9E1EA"))
    canvas.line(doc.leftMargin, 1.35 * cm, A4[0] - doc.rightMargin, 1.35 * cm)
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(colors.HexColor("#667085"))
    canvas.drawString(doc.leftMargin, 0.86 * cm, "UNA Laticinios - Relatorio de evidencia operacional")
    canvas.drawRightString(A4[0] - doc.rightMargin, 0.86 * cm, f"Pagina {doc.page}")
    canvas.restoreState()

def table(data, widths, header=True):
    prepared = []
    for row_index, row in enumerate(data):
        style = "CellBold" if header and row_index == 0 else "Cell"
        prepared.append([P(value, style) for value in row])
    result = Table(prepared, colWidths=widths, repeatRows=1 if header else 0, hAlign="LEFT")
    table_style = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#D9E1EA")),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    if header:
        table_style += [
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#17365D")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ]
    for index in range(1 if header else 0, len(data)):
        if index % 2 == 0:
            table_style.append(("BACKGROUND", (0, index), (-1, index), colors.HexColor("#F7F9FC")))
    result.setStyle(TableStyle(table_style))
    return result

doc = SimpleDocTemplate(
    OUTPUT, pagesize=A4, leftMargin=1.65 * cm, rightMargin=1.65 * cm,
    topMargin=1.45 * cm, bottomMargin=1.8 * cm,
)

story = [
    P("Relatorio de conclusao", "ReportTitle"),
    P("Origem do contas a receber - VEN-2026-1790082660528", "SubTitle"),
    table([
        ["Venda", "VEN-2026-1790082660528", "Atendimento", "ATD-1 (Concluido)"],
        ["Cliente", "BEMIX SUPERMERCADOS LTDA", "Valor", "R$ 2.094,20"],
        ["Base da analise", "Registros do banco operacional consultados somente para leitura em 29/09/2026", "Situacao", "Titulo financeiro aberto"],
    ], [2.0 * cm, 6.15 * cm, 2.2 * cm, 5.15 * cm], header=False),
    P("Conclusao objetiva", "Section"),
    P("Os registros confirmam que o contas a receber de <b>R$ 2.094,20</b> foi gerado automaticamente pelo fluxo normal de atendimento da venda <b>VEN-2026-1790082660528</b>.", "BodyReport"),
    P("Nao foi identificado lancamento avulso, duplicidade, valor divergente ou vinculo criado aleatoriamente. O titulo financeiro esta ligado, por chaves internas, tanto a venda quanto ao atendimento que o originou e foi criado no exato mesmo instante do atendimento.", "BodyReport"),
    Table([[P("Com base nas evidencias disponiveis, nao ha indicio de bug na geracao do contas a receber. A sequencia registrada corresponde ao comportamento esperado: venda -> atendimento concluido -> fatura gerada.", "Callout")]], colWidths=[15.5 * cm], style=TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#EAF3F0")),
        ("BOX", (0, 0), (-1, -1), 0.7, colors.HexColor("#7CB29E")),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ])),
    P("Evidencias verificadas", "Section"),
    table([
        ["Verificacao", "Evidencia encontrada"],
        ["Venda vinculada", "VEN-2026-1790082660528, status Atendido"],
        ["Atendimento de origem", "ATD-1, status Concluido"],
        ["Valores", "Venda e contas a receber: R$ 2.094,20"],
        ["Descricao do titulo", "Venda VEN-2026-1790082660528 - BEMIX SUPERMERCADOS LTDA (Fatura - Atendimento ATD-1)"],
        ["Vinculo com a venda", "reference_table = sales_orders e reference_id igual a chave interna da venda"],
        ["Vinculo com o atendimento", "attendance_id igual a chave interna do atendimento ATD-1"],
        ["Duplicidade", "Nao identificada para esta venda na consulta realizada"],
    ], [4.05 * cm, 11.45 * cm]),
    P("Linha do tempo da operacao", "Section"),
    P("Os horarios foram gravados no banco em UTC e convertidos para o horario de Recife (UTC-3).", "BodyReport"),
    table([
        ["Evento", "Registro no banco (UTC)", "Horario Recife"],
        ["Criacao da venda", "22/09/2026 13:11:00,593", "22/09/2026 10:11:00,593"],
        ["Criacao/conclusao do atendimento ATD-1", "22/09/2026 13:12:46,208", "22/09/2026 10:12:46,208"],
        ["Geracao do contas a receber", "22/09/2026 13:12:46,208", "22/09/2026 10:12:46,208"],
    ], [5.3 * cm, 5.1 * cm, 5.1 * cm]),
    P("O atendimento e o contas a receber possuem a mesma data, hora e milissegundo de criacao. Somado aos vinculos internos e a identificacao ATD-1 na descricao do titulo, isso demonstra que a fatura foi criada como consequencia direta do atendimento.", "BodyReport"),
    PageBreak(),
    P("Esclarecimentos e limites da analise", "Section"),
    P("A tela apresenta a data comercial um dia antes porque converte registros gravados a meia-noite em UTC para o fuso de Recife. Trata-se de um problema de exibicao de datas; ele nao altera valor, atendimento, vinculos internos nem a geracao do contas a receber.", "BodyReport"),
    P("Os campos de usuario da venda e do atendimento estao vazios. Portanto, nao e possivel atribuir a operacao a uma pessoa especifica com os dados atuais. Essa ausencia de autoria nao invalida os vinculos tecnicos que comprovam a origem automatica do titulo.", "BodyReport"),
    P("Nota tecnica: os registros permitem demonstrar que este titulo foi gerado de forma consistente pelo fluxo previsto. Eles nao permitem afirmar, de modo absoluto, que software algum jamais poderia apresentar defeito.", "Callout"),
]

doc.build(story, onFirstPage=footer, onLaterPages=footer)
print(OUTPUT)
