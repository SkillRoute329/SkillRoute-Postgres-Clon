import xlrd
import datetime

files = [
    r"C:\Users\jonat\Desktop\PROYECTOS\TransformaFacil-2.0\CARTONES Hábil verano 2026 desde 26.12.2025.xls",
    r"C:\Users\jonat\Desktop\PROYECTOS\TransformaFacil-2.0\BOLETIN Hábil verano 2026 desde 26.12.2025.xls",
    r"C:\Users\jonat\Desktop\PROYECTOS\TransformaFacil-2.0\matriz de servcio.xls",
    r"C:\Users\jonat\Desktop\PROYECTOS\TransformaFacil-2.0\R-21.01.2026.xls",
]

def format_cell(cell, wb):
    """Format cell value based on type"""
    if cell.ctype == xlrd.XL_CELL_EMPTY:
        return ''
    elif cell.ctype == xlrd.XL_CELL_TEXT:
        return cell.value[:50]
    elif cell.ctype == xlrd.XL_CELL_NUMBER:
        val = cell.value
        # Check if it looks like a time (between 0 and 1)
        if 0 < val < 1:
            hours = int(val * 24)
            minutes = int((val * 24 - hours) * 60)
            return f"{hours:02d}:{minutes:02d}"
        elif val == int(val):
            return str(int(val))
        else:
            return f"{val:.2f}"
    elif cell.ctype == xlrd.XL_CELL_DATE:
        try:
            dt = xlrd.xldate_as_tuple(cell.value, wb.datemode)
            if dt[0] == 0:  # time only
                return f"{dt[3]:02d}:{dt[4]:02d}"
            return f"{dt[2]:02d}/{dt[1]:02d}/{dt[0]}"
        except:
            return str(cell.value)
    elif cell.ctype == xlrd.XL_CELL_BOOLEAN:
        return 'TRUE' if cell.value else 'FALSE'
    else:
        return str(cell.value)[:50]

for filepath in files:
    print("=" * 120)
    print(f"ARCHIVO: {filepath.split(chr(92))[-1]}")
    print("=" * 120)
    
    try:
        wb = xlrd.open_workbook(filepath, formatting_info=True)
        print(f"Hojas: {wb.sheet_names()}")
        
        for sheet_idx, sheet_name in enumerate(wb.sheet_names()):
            sheet = wb.sheet_by_name(sheet_name)
            print(f"\n{'='*80}")
            print(f"  HOJA: '{sheet_name}' | Filas: {sheet.nrows} | Columnas: {sheet.ncols}")
            print(f"{'='*80}")
            
            # Show all rows for small sheets, or first 50 for large ones
            max_rows = min(sheet.nrows, 50)
            max_cols = min(sheet.ncols, 25)
            
            for row_idx in range(max_rows):
                row_data = []
                for col_idx in range(max_cols):
                    cell = sheet.cell(row_idx, col_idx)
                    formatted = format_cell(cell, wb)
                    row_data.append(formatted)
                
                line = " | ".join(row_data)
                if line.replace("|","").replace(" ",""):
                    print(f"  R{row_idx:03d}: {line}")
            
            if sheet.nrows > max_rows:
                print(f"\n  ... ({sheet.nrows - max_rows} filas mas) ...")
                # Show last 5 rows
                for row_idx in range(max(max_rows, sheet.nrows-5), sheet.nrows):
                    row_data = []
                    for col_idx in range(max_cols):
                        cell = sheet.cell(row_idx, col_idx)
                        formatted = format_cell(cell, wb)
                        row_data.append(formatted)
                    line = " | ".join(row_data)
                    if line.replace("|","").replace(" ",""):
                        print(f"  R{row_idx:03d}: {line}")
                    
    except Exception as e:
        print(f"Error: {e}")
        # Try with pandas
        try:
            import pandas as pd
            dfs = pd.read_excel(filepath, sheet_name=None, engine='xlrd')
            for sname, df in dfs.items():
                print(f"\n  HOJA: '{sname}' | Filas: {len(df)} | Columnas: {len(df.columns)}")
                print(f"  Columnas: {list(df.columns)}")
                print(df.head(30).to_string())
        except Exception as e2:
            print(f"Error con pandas tambien: {e2}")
    
    print("\n\n")
