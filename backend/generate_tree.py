
import os

startpath = r'c:\Users\jonat\Desktop\trasnfomaFacil2.0\TransformaFacil-2.0'
exclude_dirs = {'node_modules', '.git', 'dist', 'build', '.gemini', 'coverage', '.vscode'}

def list_files(startpath):
    for root, dirs, files in os.walk(startpath):
        dirs[:] = [d for d in dirs if d not in exclude_dirs]
        level = root.replace(startpath, '').count(os.sep)
        indent = ' ' * 4 * (level)
        print('{}{}/'.format(indent, os.path.basename(root)))
        subindent = ' ' * 4 * (level + 1)
        for f in files:
            print('{}{}'.format(subindent, f))

list_files(startpath)
