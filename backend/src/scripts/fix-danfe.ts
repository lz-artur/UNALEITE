import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { NfeEmissionService } from '../nfe/nfe-emission.service';
import { NfeService } from '../nfe/nfe.service';
import { NfeSefazService } from '../nfe/nfe-sefaz.service';
import { NfeConfigService } from '../nfe/nfe-config.service';
import { SupabaseService } from '../supabase/supabase.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const nfeEmissionService = app.get(NfeEmissionService);
  const nfeService = app.get(NfeService);
  const sefazService = app.get(NfeSefazService);
  const configService = app.get(NfeConfigService);
  const supabaseService = app.get(SupabaseService);

  try {
    console.log('Buscando notas autorizadas sem DANFE...');
    const { data: invoices } = await supabaseService.admin.from('nfe_invoices').select('id, access_key').eq('status', 'AUTORIZADA').is('danfe_path', null);
    
    if (!invoices || invoices.length === 0) {
      console.log('Nenhuma nota encontrada.');
      process.exit(0);
    }

    for (const inv of invoices) {
      console.log(`Processando nota ${inv.id} (Chave: ${inv.access_key})...`);
      const invoice = await nfeService.get(inv.id);
      const config = await configService.getRawConfig();
      
      if (!invoice.xml_authorized_path) {
        console.log(`Nota ${inv.id} sem XML autorizado no banco.`);
        continue;
      }
      
      const { data: xmlBlob } = await supabaseService.admin.storage.from('nfe-xml').download(invoice.xml_authorized_path);
      if (!xmlBlob) {
        console.log(`Falha ao baixar XML da nota ${inv.id}`);
        continue;
      }
      const xml = await xmlBlob.text();
      
      console.log('Gerando PDF a partir do XML...');
      try {
        const danfe = await sefazService.generateDanfe(xml, inv.access_key);
        console.log('Fazendo upload...');
        const danfePath = await (nfeEmissionService as any).upload('nfe-danfe', `${config.environment}/${inv.access_key}-danfe.pdf`, danfe, 'application/pdf');
        await supabaseService.admin.from('nfe_invoices').update({ danfe_path: danfePath }).eq('id', inv.id);
        console.log(`Nota ${inv.id} atualizada com sucesso!`);
      } catch (err) {
        console.error(`Erro ao gerar DANFE para a nota ${inv.id}:`, err);
      }
    }
  } catch (error) {
    console.error('Erro:', error);
  } finally {
    await app.close();
    process.exit(0);
  }
}

bootstrap();
