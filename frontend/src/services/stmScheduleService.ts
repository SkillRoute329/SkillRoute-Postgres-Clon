
/**
 * stmScheduleService.ts
 * 
 * Fetches theoretical schedules directly from the STM JSF application
 * using the Vite proxy to bypass CORS. 
 * Extracts data by querying the JSF ViewState and performing partial ajax requests.
 */

export interface STMScheduleItem {
  linea: string;
  sublinea: string;
  origen: string;
  destino: string;
  horaSalida: string;
  horaLlegada: string;
  tipoDia: string;
  varianteId: number | null;
  agencia: string;
}

// STM JSF type mappings (from browser subagent discovery)
export const TIPO_DIA = {
  HABIL: '68496684', // Hábiles
  SABADO: '-1856687017', // Sábados
  DOMINGO: '1292693394', // Domingos
  AHORA: '930' // Ahora
};

export const LINEA_IDS: Record<string, string> = {
  '104': '59',
  '300': '159',
  '316': '165',
  '328': '266',
  '330': '268',
  '17': '508'
  // Add other lines here dynamically if we map them all
};

export class STMScheduleService {
  /**
   * Obtiene la vista actual y el "ViewState" para realizar consultas JSF.
   */
  static async getViewState(): Promise<string> {
    const response = await fetch('/proxy-horarios/app/stm/horarios/');
    if (!response.ok) throw new Error(`HTML fetch failed: ${response.status}`);
    const html = await response.text();
    const match = html.match(/name="javax\.faces\.ViewState" value="([^"]+)"/);
    if (match && match[1]) return match[1];
    throw new Error('No se pudo obtener el javax.faces.ViewState de la página de STM');
  }

  /**
   * Obtiene los horarios para una línea usando su ID interno y tipo de día.
   */
  static async getSchedules(lineName: string, tipoDiaId = TIPO_DIA.HABIL): Promise<STMScheduleItem[]> {
    const lineId = LINEA_IDS[lineName];
    if (!lineId) {
      console.warn(`Línea ${lineName} no tiene un ID interno mapeado para scraping de horarios.`);
      return [];
    }

    try {
      const viewState = await this.getViewState();

      const params = new URLSearchParams();
      params.append('javax.faces.partial.ajax', 'true');
      params.append('javax.faces.source', 'j_idt26:btnConsultar');
      params.append('javax.faces.partial.execute', '@all');
      params.append('javax.faces.partial.render', 'j_idt26:mensajes j_idt26:tblResultadoCentral');
      params.append('j_idt26:btnConsultar', 'j_idt26:btnConsultar');
      params.append('j_idt26', 'j_idt26');
      params.append('j_idt26:slLinea_input', `class uy.gub.imm.stm.core.stm20.dto.LineaDTO@${lineId}`);
      params.append('j_idt26:j_idt36_input', `class uy.gub.imm.stm.core.stm20.dto.TipoDiaDTO@${tipoDiaId}`);
      params.append('javax.faces.ViewState', viewState);

      const response = await fetch('/proxy-horarios/app/stm/horarios/pages/consultar.xhtml', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Faces-Request': 'partial/ajax',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: params.toString()
      });

      if (!response.ok) throw new Error(`Schedule fetch failed: ${response.status}`);
      const xmlData = await response.text();
      return this.parsePrimeFacesXML(xmlData, lineName);
    } catch (err) {
      console.error('Error fetching STM schedules:', err);
      return [];
    }
  }

  /**
   * Parsea la respuesta XML tonta de Primefaces que contiene el HTML y extrae la tabla de horarios
   */
  private static parsePrimeFacesXML(xmlString: string, lineName: string): STMScheduleItem[] {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");
    
    // Buscar la actualización que contenga la tabla (suele estar en <update id="j_idt26:tblResultadoCentral">)
    const updates = Array.from(xmlDoc.getElementsByTagName('update'));
    let htmlContent = '';
    
    for (const update of updates) {
      const cdata = update.textContent;
      if (cdata && cdata.includes('<table') && cdata.includes('ui-datatable')) {
        htmlContent = cdata;
        break;
      }
    }

    if (!htmlContent) return []; // No hay tabla devuelta

    // Parsear el HTML interno 
    const htmlDoc = parser.parseFromString(htmlContent, "text/html");
    const rows = htmlDoc.querySelectorAll('tbody.ui-datatable-data > tr');
    
    const schedules: STMScheduleItem[] = [];
    
    rows.forEach(row => {
      const cols = row.querySelectorAll('td');
      if (cols.length >= 4) {
        schedules.push({
          linea: lineName,
          sublinea: cols[0]?.textContent?.trim() || '',
          origen: cols[1]?.textContent?.trim() || '',
          destino: cols[2]?.textContent?.trim() || '',
          horaSalida: cols[3]?.textContent?.trim() || '',
          horaLlegada: cols[4]?.textContent?.trim() || '', // Si es q lo proveen a veces es distinto
          tipoDia: 'Habil',
          varianteId: null,
          agencia: 'STM'
        });
      }
    });

    return schedules;
  }
}
