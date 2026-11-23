import QtQuick
import StartCode

/* Entrada de un elemento: aparece subiendo y creciendo un poco. Se pone como
   hijo del elemento que se anima; `index` escalona las entradas de una lista
   o rejilla (cada una un poco después de la anterior).

       Repeater { model: …; Card { Entrance { index: parent.index } } }

   No toca el diseño: mueve con una transformación. Con «Reducir animaciones»
   no hace nada. */
Item {
    id: root

    property Item target: parent
    property int index: 0
    property real rise: Theme.moRise
    /* Escala de partida (1: sin crecer). */
    property real from: 0.96
    property int duration: Theme.moSlow
    /* Para listas que se repintan con cada dato nuevo: `seen` es un objeto de
       la página y `key` la identidad del elemento; solo entra la primera vez
       que aparece esa clave, no cada vez que la lista se rehace. */
    property var seen: null
    property string key: ""
    /* Como mucho doce pasos: una lista larga no tarda en terminar de entrar. */
    readonly property int delay: Math.min(Math.max(index, 0), 12) * Theme.moStagger

    visible: false
    width: 0; height: 0

    function play() {
        if (Theme.reducedMotion || !target) return
        anim.restart()
    }

    Translate { id: shift }
    Scale {
        id: grow
        origin.x: root.target ? root.target.width / 2 : 0
        origin.y: root.target ? root.target.height / 2 : 0
    }

    Component.onCompleted: {
        if (Theme.reducedMotion || !target) return
        if (seen !== null && key !== "") {
            if (seen[key]) return
            seen[key] = true
        }
        /* Se añaden a las transformaciones que ya tenga el elemento. */
        const list = []
        for (let i = 0; i < target.transform.length; i++) list.push(target.transform[i])
        list.push(grow, shift)
        target.transform = list
        target.opacity = 0
        shift.y = rise
        grow.xScale = from; grow.yScale = from
        anim.start()
    }

    SequentialAnimation {
        id: anim
        PauseAnimation { duration: root.delay }
        ParallelAnimation {
            NumberAnimation { target: root.target; property: "opacity"; from: 0; to: 1; duration: root.duration * 0.8 }
            NumberAnimation {
                target: shift; property: "y"; from: root.rise; to: 0; duration: root.duration
                easing.type: Easing.BezierSpline; easing.bezierCurve: Theme.moEase
            }
            NumberAnimation {
                target: grow; properties: "xScale,yScale"; from: root.from; to: 1; duration: root.duration
                easing.type: Easing.BezierSpline; easing.bezierCurve: Theme.moEase
            }
        }
    }
}
