env = {
	MAP_IMM : 'https://geoserver.montevideo.gub.uy/geoserver/wms'

}
// //MAP_IMM : 'https://geoweb-desa2/geoserver/wms'

dir = {  
		ICON_ORIGEN : '../javax.faces.resource/icon-origen.svg.xhtml?ln=images', 
		ICON_DESTINO : '../javax.faces.resource/icon-destino.svg.xhtml?ln=images',
		ICON_PARADA : '../javax.faces.resources/icon-parada.svg.xhtml?ln=images',
		//ICON_PARADA : '../javax.faces.resource/icon-parada.svg.xhtml?ln=images',
		ICON_FECHA : '../resources/images/arrowSmall.png',
		ICON_CONTROL : '../javax.faces.resource/icon-parada-control.png.xhtml?ln=images',
		ICON_ACCESIBLE : '../javax.faces.resource/icon-ruta.png.xhtml?ln=images',
		ICON_INTERCAMBIO : '../javax.faces.resource/icon-intercambio.png.xhtml?ln=images',
		ICON_MARCADOR : '../javax.faces.resource/icon-marcador.png.xhtml?ln=images'
} 
geoserver = {
	PARADAS_HORARIOS_DESHABILITADAS : 'https://geoserver.montevideo.gub.uy/geoserver/ows?service=wfs&version=2.0.0&request=GetFeature&typename=imm:v_uptu_ubic_paradas_con_horarios_deshabilitadas&outputFormat=application/json&srsname=EPSG%3A32721',
    CAPA_VARIANTE_HABILITADAS : 'https://geoserver.montevideo.gub.uy/geoserver/ows?service=wfs&version=2.0.0&request=GetFeature&typename=imm%3Av_uptu_sentido_variante&CQL_FILTER=cod_variante%3D3626&outputFormat=application/json&srsname=EPSG%3A32721',
    CAPA_PARADAS_VARIANTE : 'https://geoserver.montevideo.gub.uy/geoserver/imm/ows',
    CAPA_IMAGEN_WS : 'http://geoserver.montevideo.gub.uy/geoserver/wms',
    CAPA_TEST_VARIANTE : 'http://geoserver.montevideo.gub.uy/geoserver/wms?service=WMS&version=1.1.0&request=GetMap&layers=stm_variante_destino',
    CAPA_VARIANTE_CQL_FILTER : 'https://geoserver.montevideo.gub.uy/geoserver/ows?service=wfs&version=2.0.0&request=GetFeature&typename=imm%3Av_uptu_sentido_variante&CQL_FILTER=cod_variante%3D',
    CAPA_VARIANTE_CQL_FILTER_CIERRE : '&outputFormat=application/json&srsname=EPSG%3A32721',
    CAPA_TEST : 'http://geoserver.montevideo.gub.uy/geoserver/imm/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&FORMAT=image%2Fpng&TRANSPARENT=true&STYLES&LAYERS=imm%3Av_uptu_sentido_variante&CQL_FILTER=',
    CAPA_PUNTOS_CONTROL: 'http://geoserver.imm.gub.uy:8080/geoserver/imm/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&FORMAT=image%2Fpng&TRANSPARENT=true&LAYERS=imm%3Av_uptu_horarios_control&STYLES&CQL_FILTER=cod_variante%3D',
    CAPA_PUNTOS_CONTROL_CIERRE: '&SRS=EPSG%3A32721'
    	
}

  
