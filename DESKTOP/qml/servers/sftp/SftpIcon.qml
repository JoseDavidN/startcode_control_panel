import QtQuick
import StartCode

/* Iconos del explorador SFTP (trazos de `sftp/icons.tsx`). Con `entry` elige
   solo el de una entrada del servidor: carpeta, enlace o archivo, cada uno con
   su color. Con `kind`, uno concreto. */
Icon {
    id: root

    /* Entrada del directorio remoto: `{ type, linkType }`. */
    property var entry: null
    /* folder · file · link · arrowUp · refresh · folderPlus · download · upload · sftp */
    property string kind: !entry ? ""
                        : entry.type === "dir" || entry.linkType === "dir" ? "folder"
                        : entry.type === "symlink" ? "link" : "file"

    readonly property var glyphs: ({
        sftp: "M12 3v10M8 9l4 4 4-4M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3",
        folder: "M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z",
        file: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6",
        link: "M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71",
        arrowUp: "M12 19V5M5 12l7-7 7 7",
        refresh: "M21 12a9 9 0 11-3-6.7L21 8M21 3v5h-5",
        folderPlus: "M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2zM12 11v6M9 14h6",
        download: "M12 4v11M7 10l5 5 5-5M5 20h14",
        upload: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"
    })

    path: glyphs[kind] || ""
    color: !entry ? Theme.ink(0.65)
         : kind === "folder" ? Theme.tone("violet").text
         : kind === "link" ? Theme.tone("sky").text
         : Theme.ink(0.45)
}
