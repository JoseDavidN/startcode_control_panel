// Instalador de StartCode Panel para Windows: una ventana propia con el icono
// de la app, el estado y una barra de progreso, con la identidad de StartCode
// (DESIGN.md, tema Nocturno). Win32 y GDI+, sin Qt: tiene que funcionar antes
// de que Qt esté instalado. El trabajo (instalacion.cpp) va en un hilo aparte
// y avisa a la ventana con mensajes.
//
//   StartCodePanelInstalador.exe        instala y abre StartCode Panel; si ya
//                                       está instalado, pregunta: desinstalar
//                                       o actualizar (reinstalar)
//   desinstalar.exe --desinstalar       lo quita (la entrada de Windows lo llama así)
//   StartCodePanelInstalador.exe --actualizar <pid>
//                                       para que la app se actualice sola tras
//                                       descargarlo: espera a que el proceso
//                                       <pid> (la app) se cierre, instala sin
//                                       preguntar y la vuelve a abrir

#include <windows.h>
#include <windowsx.h>
#include <dwmapi.h>
#include <objidl.h>
#include <shlwapi.h>

#include <algorithm>
#include <memory>
#include <iterator>
#include <cwchar>
#include <string>
#include <thread>
#include <vector>

// Las cabeceras de GDI+ usan min y max sin calificar
namespace Gdiplus {
using std::max;
using std::min;
}
#include <gdiplus.h>

#include "instalacion.h"

using namespace Gdiplus;

namespace {

// Colores del panel (tema Nocturno de DESIGN.md y qml/theme/Theme.qml). El
// fondo usa la parte púrpura del degradado de la app, sin llegar al casi negro
// de sus bordes: en una ventana tan pequeña se veía apagado, y las auroras de
// la marca (púrpura, rosa, índigo) van más presentes.
const Color BgBase(255, 0x1a, 0x0c, 0x38);
const Color BgMid(255, 0x2a, 0x13, 0x52);
const Color BgGlow(255, 0x3d, 0x1d, 0x78);
const Color Brand1(255, 0xa8, 0x55, 0xf7);
const Color Brand2(255, 0xec, 0x48, 0x99);
const Color Aurora3(255, 0x63, 0x66, 0xf1);
const Color Ink(255, 0xf4, 0xf1, 0xff);
const Color OnBrand(255, 255, 255, 255);
const Color InkButton(217, 255, 255, 255);    // text-white/85
const Color InkSecondary(166, 255, 255, 255); // 65 %
const Color InkMuted(115, 255, 255, 255);     // 45 %
const Color Track(20, 255, 255, 255);         // track, 8 %
const Color Hairline(33, 255, 255, 255);      // hairline, 13 %
const Color HairlineStrong(51, 255, 255, 255); // hairline-strong, 20 %
const Color TintHover(15, 255, 255, 255);     // tint-hover, 6 %
const Color TintActive(26, 255, 255, 255);    // tint-active, 10 %
const Color Danger(255, 0xfb, 0x71, 0x85);
const Color DangerFill(46, 0xfb, 0x71, 0x85);      // 18 %
const Color DangerFillHover(71, 0xfb, 0x71, 0x85); // 28 %
const Color DangerEdge(102, 0xfb, 0x71, 0x85);     // 40 %

// Radio y alto de los botones (Theme.radiusXl y Theme.controlHeight)
constexpr float RadioBoton = 12;
constexpr float AltoBoton = 40;

// Medidas a 100 % de escala (se multiplican por los DPI de la pantalla)
constexpr int Ancho = 480;
constexpr int Alto = 340;

// Recursos (recursos.rc.in)
constexpr int RecursoIcono = 100;
constexpr int RecursoFuente = 101;
constexpr int RecursoLogo = 102;

constexpr UINT MsgAvance = WM_APP + 1;    // wParam: milésimas
constexpr UINT MsgTerminado = WM_APP + 2; // lParam: std::wstring* con el error ("" si bien)
constexpr UINT_PTR TimerAnimacion = 1;
constexpr UINT_PTR TimerCerrar = 2;

// Pregunta: StartCode Panel ya estaba instalado y se espera a que el usuario elija
enum class Fase { Pregunta, Trabajando, Listo, Error };

enum class Boton { Ninguno, Cerrar, Cancelar, Reinstalar, Desinstalar };

struct Estado {
    bool desinstalando = false;
    // Abierto por la app para actualizarse: sin pregunta, tras esperar a que se cierre
    bool actualizando = false;
    unsigned long pidPanel = 0;
    Fase fase = Fase::Trabajando;
    std::wstring versionInstalada; // la de la instalación que ya había
    bool conPaquete = false;       // este .exe puede instalar (no es el desinstalador)
    // Al terminar de desinstalar, botón «Cerrar» en vez de cerrarse solo. Solo
    // desde fuera de la carpeta: desde dentro, la carpeta no se borra hasta
    // que este proceso termina (ver desinstalar())
    bool cerrarConBoton = false;
    double objetivo = 0;  // avance real
    double mostrado = 0;  // el de la barra, que lo sigue suavemente
    std::wstring error;
    Boton sobre = Boton::Ninguno;   // bajo el ratón
    Boton pulsado = Boton::Ninguno; // donde se pulsó: el clic cuenta si se suelta en el mismo
    float escala = 1;
    std::thread trabajo;
    // Objetos de GDI+: se crean tras GdiplusStartup y se sueltan antes de
    // GdiplusShutdown (liberarRecursos)
    std::unique_ptr<PrivateFontCollection> fuentes;
    std::unique_ptr<FontFamily> familia;
    std::unique_ptr<Bitmap> logo;
    std::wstring instalador;
};

Estado estado;

// ── Recursos ─────────────────────────────────────────────────────────

const void *recurso(int id, DWORD *tamano)
{
    HRSRC info = FindResourceW(nullptr, MAKEINTRESOURCEW(id), MAKEINTRESOURCEW(10)); // RT_RCDATA
    HGLOBAL datos = info ? LoadResource(nullptr, info) : nullptr;
    *tamano = info ? SizeofResource(nullptr, info) : 0;
    return datos ? LockResource(datos) : nullptr;
}

void cargarRecursos()
{
    // Space Grotesk, la tipografía por defecto de la interfaz; si falla, la
    // del sistema
    DWORD tamano = 0;
    if (const void *fuente = recurso(RecursoFuente, &tamano)) {
        estado.fuentes = std::make_unique<PrivateFontCollection>();
        estado.fuentes->AddMemoryFont(fuente, INT(tamano));
        INT encontradas = 0;
        if (estado.fuentes->GetFamilyCount() > 0) {
            auto familia = std::make_unique<FontFamily>();
            estado.fuentes->GetFamilies(1, familia.get(), &encontradas);
            if (encontradas > 0 && familia->IsStyleAvailable(FontStyleRegular)
                && familia->IsStyleAvailable(FontStyleBold))
                estado.familia = std::move(familia);
        }
    }
    if (!estado.familia)
        estado.familia = std::make_unique<FontFamily>(L"Segoe UI");
    // Icono de StartCode Panel (assets/icons/app-512.png)
    if (const void *png = recurso(RecursoLogo, &tamano)) {
        if (IStream *flujo = SHCreateMemStream(static_cast<const BYTE *>(png), tamano)) {
            estado.logo.reset(Bitmap::FromStream(flujo));
            flujo->Release();
        }
    }
}

// ── Dibujo ───────────────────────────────────────────────────────────

float px(float valor)
{
    return valor * estado.escala;
}

RectF rectangulo(float x, float y, float ancho, float alto)
{
    return RectF(px(x), px(y), px(ancho), px(alto));
}

void redondeado(GraphicsPath &camino, const RectF &r, float radio)
{
    const float d = radio * 2;
    camino.AddArc(r.X, r.Y, d, d, 180, 90);
    camino.AddArc(r.GetRight() - d, r.Y, d, d, 270, 90);
    camino.AddArc(r.GetRight() - d, r.GetBottom() - d, d, d, 0, 90);
    camino.AddArc(r.X, r.GetBottom() - d, d, d, 90, 90);
    camino.CloseFigure();
}

void texto(Graphics &g, const std::wstring &cadena, const RectF &r, float tamano, int estilo, const Color &color)
{
    Font fuente(estado.familia.get(), px(tamano), estilo, UnitPixel);
    StringFormat formato;
    formato.SetAlignment(StringAlignmentCenter);
    formato.SetLineAlignment(StringAlignmentCenter);
    SolidBrush pincel(color);
    g.DrawString(cadena.c_str(), -1, &fuente, r, &formato, &pincel);
}

std::wstring versionPropia()
{
    const std::string version = STARTCODE_VERSION; // ASCII
    return std::wstring(version.begin(), version.end());
}

// Como en la app: primario (PrimaryButton, degradado de la marca), secundario
// (SecondaryButton, cristal) y peligro (DangerButton, rojo semántico)
enum class Estilo { Primario, Secundario, Peligro };

struct BotonVisible {
    Boton id;
    const wchar_t *texto;
    Estilo estilo;
    RectF r;
};

// Los botones de la fase actual, centrados en una fila
std::vector<BotonVisible> botones()
{
    std::vector<BotonVisible> lista;
    if (estado.fase == Fase::Pregunta) {
        lista.push_back({ Boton::Cancelar, L"Cancelar", Estilo::Secundario, {} });
        lista.push_back({ Boton::Desinstalar, L"Desinstalar", Estilo::Peligro, {} });
        if (estado.conPaquete) {
            const bool misma = estado.versionInstalada.empty() || estado.versionInstalada == versionPropia();
            lista.push_back({ Boton::Reinstalar, misma ? L"Reinstalar" : L"Actualizar", Estilo::Primario, {} });
        }
    } else if (estado.fase == Fase::Error
               || (estado.fase == Fase::Listo && estado.cerrarConBoton && estado.mostrado >= 1.0)) {
        lista.push_back({ Boton::Cerrar, L"Cerrar", Estilo::Secundario, {} });
    }
    if (lista.empty())
        return lista;
    const float ancho = lista.size() == 1 ? 128.0f : 120.0f;
    const float separacion = 12;
    const float n = float(lista.size());
    float x = (Ancho - (n * ancho + (n - 1) * separacion)) / 2;
    const float y = estado.fase == Fase::Pregunta ? 224.0f : 214.0f;
    for (auto &boton : lista) {
        boton.r = rectangulo(x, y, ancho, AltoBoton);
        x += ancho + separacion;
    }
    return lista;
}

// Botón en un punto de la zona de cliente
Boton botonEn(float x, float y)
{
    for (const auto &boton : botones()) {
        if (boton.r.Contains(PointF(x, y)))
            return boton.id;
    }
    return Boton::Ninguno;
}

void dibujarBoton(Graphics &g, const BotonVisible &boton)
{
    const bool sobre = estado.sobre == boton.id;
    GraphicsPath forma;
    redondeado(forma, boton.r, px(RadioBoton));
    switch (boton.estilo) {
    case Estilo::Primario: {
        // grad-brand: degradado de la marca a 135°, tinta on-brand
        LinearGradientBrush marca(boton.r, Brand1, Brand2, LinearGradientModeForwardDiagonal);
        g.FillPath(&marca, &forma);
        if (sobre) {
            SolidBrush brillo(TintActive);
            g.FillPath(&brillo, &forma);
        }
        texto(g, boton.texto, boton.r, 14, FontStyleBold, OnBrand);
        break;
    }
    case Estilo::Secundario: {
        SolidBrush fondo(sobre ? TintActive : TintHover);
        g.FillPath(&fondo, &forma);
        Pen borde(sobre ? HairlineStrong : Hairline, px(1));
        g.DrawPath(&borde, &forma);
        texto(g, boton.texto, boton.r, 14, FontStyleRegular, InkButton);
        break;
    }
    case Estilo::Peligro: {
        SolidBrush fondo(sobre ? DangerFillHover : DangerFill);
        g.FillPath(&fondo, &forma);
        Pen borde(DangerEdge, px(1));
        g.DrawPath(&borde, &forma);
        texto(g, boton.texto, boton.r, 14, FontStyleBold, Danger);
        break;
    }
    }
}

// Mancha de color difuminada (las «auroras» del fondo de la app)
void aurora(Graphics &g, float cx, float cy, float radio, const Color &color, BYTE alfa)
{
    GraphicsPath forma;
    forma.AddEllipse(px(cx - radio), px(cy - radio), px(radio * 2), px(radio * 2));
    PathGradientBrush pincel(&forma);
    pincel.SetCenterColor(Color(alfa, color.GetR(), color.GetG(), color.GetB()));
    Color fuera(0, color.GetR(), color.GetG(), color.GetB());
    INT colores = 1;
    pincel.SetSurroundColors(&fuera, &colores);
    g.FillPath(&pincel, &forma);
}

void dibujar(HDC hdc, int ancho, int alto)
{
    Bitmap lienzo(ancho, alto, PixelFormat32bppARGB);
    Graphics g(&lienzo);
    g.SetSmoothingMode(SmoothingModeAntiAlias);
    g.SetTextRenderingHint(TextRenderingHintAntiAliasGridFit);
    g.SetInterpolationMode(InterpolationModeHighQualityBicubic);

    // Fondo de la app (AppBackground): radial desde arriba a la izquierda,
    // como radial-gradient(ellipse at 20% 0%, …) de la app pero en su gama
    // púrpura (#3d1d78 → #2a1352 → #1a0c38), y encima las auroras
    SolidBrush base(BgBase);
    g.FillRectangle(&base, 0, 0, ancho, alto);
    {
        // Elipse hasta la esquina más lejana, como «farthest-corner» en CSS
        const float cx = ancho * 0.2f;
        const float rx = ancho * 0.8f * 1.4142f;
        const float ry = alto * 1.4142f;
        GraphicsPath elipse;
        elipse.AddEllipse(cx - rx, -ry, rx * 2, ry * 2);
        PathGradientBrush radial(&elipse);
        // En GDI+ la posición 0 es el borde y 1 el centro: al revés que en CSS
        const Color colores[] = { BgBase, BgBase, BgMid, BgGlow };
        const REAL posiciones[] = { 0.0f, 0.25f, 0.65f, 1.0f };
        radial.SetInterpolationColors(colores, posiciones, 4);
        g.FillPath(&radial, &elipse);
    }
    aurora(g, 40, -30, 260, Brand1, 120);
    aurora(g, float(Ancho) + 20, 150, 220, Brand2, 84);
    aurora(g, 190, float(Alto) + 70, 240, Aurora3, 84);

    // Icono de StartCode Panel y el nombre. Sin el recurso, un cuadrado
    // redondeado con el degradado de la marca
    const RectF logo = rectangulo((Ancho - 56) / 2.0f, 36, 56, 56);
    if (estado.logo) {
        g.DrawImage(estado.logo.get(), logo);
    } else {
        LinearGradientBrush marca(logo, Brand1, Brand2, LinearGradientModeForwardDiagonal);
        GraphicsPath forma;
        redondeado(forma, logo, px(14));
        g.FillPath(&marca, &forma);
    }
    texto(g, L"StartCode Panel", rectangulo(0, 102, Ancho, 36), 22, FontStyleBold, Ink);

    if (estado.fase == Fase::Pregunta) {
        // Qué hay instalado y qué se puede hacer, antes de tocar nada
        texto(g, L"StartCode Panel ya está instalado", rectangulo(32, 146, Ancho - 64, 24), 15, FontStyleBold,
              Ink);
        std::wstring version;
        if (!estado.versionInstalada.empty()) {
            version = L"Versión instalada: " + estado.versionInstalada;
            if (estado.conPaquete && estado.versionInstalada != versionPropia())
                version += L" · este instalador: " + versionPropia();
        }
        texto(g, version, rectangulo(32, 172, Ancho - 64, 18), 12, FontStyleRegular, InkSecondary);
        texto(g, L"Tu sesión y tus ajustes se conservan.", rectangulo(32, 191, Ancho - 64, 18), 12,
              FontStyleRegular, InkMuted);
    }

    // Estado
    std::wstring linea;
    Color colorLinea = InkSecondary;
    if (estado.fase == Fase::Error) {
        linea = estado.error;
        colorLinea = Danger;
    } else if (estado.fase == Fase::Listo) {
        linea = estado.desinstalando ? L"StartCode Panel se ha desinstalado."
            : estado.actualizando    ? L"StartCode Panel está actualizado. Abriéndolo…"
                                     : L"StartCode Panel está listo. Abriéndolo…";
    } else {
        const int porcentaje = int(estado.mostrado * 100 + 0.5);
        linea = (estado.desinstalando ? L"Desinstalando… "
                 : estado.actualizando  ? L"Actualizando… "
                                        : L"Instalando… ")
            + std::to_wstring(porcentaje) + L" %";
    }
    if (estado.fase != Fase::Pregunta)
        texto(g, linea, rectangulo(32, 152, Ancho - 64, 44), 14, FontStyleRegular, colorLinea);

    const std::vector<BotonVisible> lista = botones();
    if (!lista.empty()) {
        for (const auto &boton : lista)
            dibujarBoton(g, boton);
    } else {
        // Barra de progreso (MetricBar): pista y relleno con el degradado de la marca
        const RectF pista = rectangulo(60, 214, Ancho - 120, 6);
        GraphicsPath formaPista;
        redondeado(formaPista, pista, pista.Height / 2);
        SolidBrush fondoPista(Track);
        g.FillPath(&fondoPista, &formaPista);
        const float lleno = pista.Width * float(std::clamp(estado.mostrado, 0.0, 1.0));
        if (lleno >= pista.Height) {
            RectF relleno(pista.X, pista.Y, lleno, pista.Height);
            GraphicsPath formaRelleno;
            redondeado(formaRelleno, relleno, pista.Height / 2);
            LinearGradientBrush degradado(pista, Brand1, Brand2, LinearGradientModeHorizontal);
            g.FillPath(&degradado, &formaRelleno);
        }
    }

    // Pie: quién lo publica y qué versión trae este instalador (el
    // desinstalador, sin paquete, solo dice el editor)
    std::wstring pie = L"StartCode";
    if (!estado.desinstalando && (estado.fase != Fase::Pregunta || estado.conPaquete))
        pie += L" · versión " + versionPropia();
    texto(g, pie, rectangulo(0, 296, Ancho, 18), 11, FontStyleRegular, InkMuted);

    // Borde fino: en Windows 10 la ventana no tiene marco y se fundiría con
    // un fondo oscuro
    Pen marco(Hairline, 1);
    g.DrawRectangle(&marco, 0, 0, ancho - 1, alto - 1);

    Graphics pantalla(hdc);
    pantalla.DrawImage(&lienzo, 0, 0);
}

// ── Ventana ──────────────────────────────────────────────────────────

void empezar(HWND ventana)
{
    auto avisar = [ventana](double avance) {
        PostMessageW(ventana, MsgAvance, WPARAM(avance * 1000), 0);
    };
    const bool desinstalando = estado.desinstalando;
    const std::wstring instalador = estado.instalador;
    const unsigned long pid = estado.actualizando ? estado.pidPanel : 0;
    estado.trabajo = std::thread([ventana, avisar, desinstalando, instalador, pid] {
        // Al actualizar, la app se está cerrando: hasta que termine, sus
        // archivos están en uso (instalar() reintenta un poco más)
        if (pid) {
            if (HANDLE proceso = OpenProcess(SYNCHRONIZE, FALSE, pid)) {
                WaitForSingleObject(proceso, 60000);
                CloseHandle(proceso);
            }
        }
        CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
        auto *error = new std::wstring(desinstalando ? desinstalar(avisar) : instalar(instalador, avisar));
        CoUninitialize();
        PostMessageW(ventana, MsgTerminado, 0, LPARAM(error));
    });
}

// Tras elegir en la pregunta: instala (actualiza) o desinstala
void elegir(HWND ventana, bool desinstalando)
{
    estado.desinstalando = desinstalando;
    estado.cerrarConBoton = desinstalando && !dentroDeInstalacion(estado.instalador);
    estado.fase = Fase::Trabajando;
    estado.sobre = Boton::Ninguno;
    estado.pulsado = Boton::Ninguno;
    SetWindowTextW(ventana, desinstalando ? L"Desinstalar StartCode Panel" : L"Instalar StartCode Panel");
    SetTimer(ventana, TimerAnimacion, 16, nullptr);
    empezar(ventana);
    InvalidateRect(ventana, nullptr, FALSE);
}

LRESULT CALLBACK procedimiento(HWND ventana, UINT mensaje, WPARAM wParam, LPARAM lParam)
{
    switch (mensaje) {
    case WM_CREATE: {
        estado.escala = GetDpiForWindow(ventana) / 96.0f;
        // Esquinas redondeadas de Windows 11 (en Windows 10 no hace nada)
        const DWORD redondear = 2; // DWMWCP_ROUND
        DwmSetWindowAttribute(ventana, 33 /* DWMWA_WINDOW_CORNER_PREFERENCE */, &redondear, sizeof(redondear));
        // Con StartCode Panel ya instalado, nada empieza hasta que el usuario elige
        if (estado.fase == Fase::Trabajando) {
            SetTimer(ventana, TimerAnimacion, 16, nullptr);
            empezar(ventana);
        }
        return 0;
    }
    case WM_DPICHANGED: {
        estado.escala = HIWORD(wParam) / 96.0f;
        const RECT *sugerido = reinterpret_cast<const RECT *>(lParam);
        SetWindowPos(ventana, nullptr, sugerido->left, sugerido->top, sugerido->right - sugerido->left,
                     sugerido->bottom - sugerido->top, SWP_NOZORDER | SWP_NOACTIVATE);
        return 0;
    }
    case MsgAvance:
        estado.objetivo = std::max(estado.objetivo, double(wParam) / 1000.0);
        return 0;
    case MsgTerminado: {
        std::unique_ptr<std::wstring> error(reinterpret_cast<std::wstring *>(lParam));
        if (estado.trabajo.joinable())
            estado.trabajo.join();
        if (error->empty()) {
            estado.fase = Fase::Listo;
            estado.objetivo = 1;
        } else {
            estado.fase = Fase::Error;
            estado.error = *error;
            KillTimer(ventana, TimerAnimacion);
        }
        InvalidateRect(ventana, nullptr, FALSE);
        return 0;
    }
    case WM_TIMER:
        if (wParam == TimerAnimacion) {
            // La barra alcanza al avance real poco a poco
            estado.mostrado += (estado.objetivo - estado.mostrado) * 0.18;
            if (estado.objetivo - estado.mostrado < 0.001)
                estado.mostrado = estado.objetivo;
            InvalidateRect(ventana, nullptr, FALSE);
            if (estado.fase == Fase::Listo && estado.mostrado >= 1.0) {
                KillTimer(ventana, TimerAnimacion);
                if (!estado.desinstalando)
                    abrirPanel();
                if (!estado.cerrarConBoton)
                    SetTimer(ventana, TimerCerrar, 1200, nullptr);
            }
        } else if (wParam == TimerCerrar) {
            DestroyWindow(ventana);
        }
        return 0;
    case WM_NCHITTEST: {
        // Toda la ventana sirve para moverla, salvo los botones
        POINT punto { GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam) };
        ScreenToClient(ventana, &punto);
        if (botonEn(float(punto.x), float(punto.y)) != Boton::Ninguno)
            return HTCLIENT;
        return HTCAPTION;
    }
    case WM_MOUSEMOVE: {
        const Boton sobre = botonEn(float(GET_X_LPARAM(lParam)), float(GET_Y_LPARAM(lParam)));
        if (sobre != estado.sobre) {
            estado.sobre = sobre;
            InvalidateRect(ventana, nullptr, FALSE);
            // Aviso al salir de la zona de cliente (al resto de la ventana,
            // que es HTCAPTION, o fuera): quita el resaltado
            TRACKMOUSEEVENT seguir { sizeof(seguir), TME_LEAVE, ventana, 0 };
            TrackMouseEvent(&seguir);
        }
        SetCursor(LoadCursorW(nullptr, sobre != Boton::Ninguno ? IDC_HAND : IDC_ARROW));
        return 0;
    }
    case WM_SETCURSOR:
        // Sin esto, Windows vuelve a poner la flecha de la clase en cada movimiento
        if (LOWORD(lParam) == HTCLIENT && estado.sobre != Boton::Ninguno) {
            SetCursor(LoadCursorW(nullptr, IDC_HAND));
            return TRUE;
        }
        break;
    case WM_MOUSELEAVE:
        if (estado.sobre != Boton::Ninguno) {
            estado.sobre = Boton::Ninguno;
            InvalidateRect(ventana, nullptr, FALSE);
        }
        return 0;
    case WM_LBUTTONDOWN:
        estado.pulsado = botonEn(float(GET_X_LPARAM(lParam)), float(GET_Y_LPARAM(lParam)));
        return 0;
    case WM_LBUTTONUP: {
        const Boton boton = botonEn(float(GET_X_LPARAM(lParam)), float(GET_Y_LPARAM(lParam)));
        const bool clic = boton != Boton::Ninguno && boton == estado.pulsado;
        estado.pulsado = Boton::Ninguno;
        if (!clic)
            return 0;
        switch (boton) {
        case Boton::Cerrar:
        case Boton::Cancelar:
            DestroyWindow(ventana);
            break;
        case Boton::Reinstalar:
            elegir(ventana, false);
            break;
        case Boton::Desinstalar:
            elegir(ventana, true);
            break;
        case Boton::Ninguno:
            break;
        }
        return 0;
    }
    case WM_KEYDOWN:
        // Esc cierra cuando no hay nada en marcha (como Cancelar o Cerrar)
        if (wParam == VK_ESCAPE && estado.fase != Fase::Trabajando)
            DestroyWindow(ventana);
        return 0;
    case WM_CLOSE:
        // A medias no se cierra: dejaría la app sin instalar (o desinstalar) del todo
        if (estado.fase != Fase::Trabajando)
            DestroyWindow(ventana);
        return 0;
    case WM_ERASEBKGND:
        return 1;
    case WM_PAINT: {
        PAINTSTRUCT pintura;
        HDC hdc = BeginPaint(ventana, &pintura);
        RECT cliente;
        GetClientRect(ventana, &cliente);
        dibujar(hdc, cliente.right, cliente.bottom);
        EndPaint(ventana, &pintura);
        return 0;
    }
    case WM_DESTROY:
        if (estado.trabajo.joinable())
            estado.trabajo.join();
        PostQuitMessage(0);
        return 0;
    }
    return DefWindowProcW(ventana, mensaje, wParam, lParam);
}

} // namespace

int WINAPI wWinMain(HINSTANCE instancia, HINSTANCE, PWSTR linea, int)
{
    estado.desinstalando = std::wstring(linea).find(L"--desinstalar") != std::wstring::npos;
    // --actualizar <pid>: el número que sigue es el proceso de la app
    const size_t actualizar = std::wstring(linea).find(L"--actualizar");
    if (!estado.desinstalando && actualizar != std::wstring::npos) {
        estado.actualizando = true;
        estado.pidPanel = wcstoul(linea + actualizar + wcslen(L"--actualizar"), nullptr, 10);
    }
    if (estado.desinstalando
        && MessageBoxW(nullptr,
                       L"¿Quieres desinstalar StartCode Panel?\n\nTu sesión y tus ajustes se conservan.",
                       L"Desinstalar StartCode Panel", MB_YESNO | MB_ICONQUESTION) != IDYES)
        return 0;

    wchar_t ruta[MAX_PATH * 4] = {};
    GetModuleFileNameW(nullptr, ruta, DWORD(std::size(ruta)));
    estado.instalador = ruta;

    // Abierto sin --desinstalar con la app ya instalada: primero se pregunta
    // (desinstalar o actualizar). También si se abre desinstalar.exe a mano:
    // sin paquete, solo ofrece desinstalar
    if (!estado.desinstalando && !estado.actualizando) {
        const Instalada actual = instalacionExistente();
        if (actual.hay) {
            estado.fase = Fase::Pregunta;
            estado.versionInstalada = actual.version;
            estado.conPaquete = tienePaquete(estado.instalador);
        }
    }

    ULONG_PTR tokenGdi = 0;
    GdiplusStartupInput inicioGdi;
    GdiplusStartup(&tokenGdi, &inicioGdi, nullptr);
    cargarRecursos();

    WNDCLASSEXW clase { sizeof(clase) };
    clase.lpfnWndProc = procedimiento;
    clase.hInstance = instancia;
    clase.hCursor = LoadCursorW(nullptr, IDC_ARROW);
    clase.hIcon = LoadIconW(instancia, MAKEINTRESOURCEW(RecursoIcono));
    clase.lpszClassName = L"StartCodePanelInstalador";
    RegisterClassExW(&clase);

    // Centrada en la pantalla principal, al tamaño de sus DPI
    const UINT dpi = GetDpiForSystem();
    const int ancho = MulDiv(Ancho, int(dpi), 96);
    const int alto = MulDiv(Alto, int(dpi), 96);
    const int x = (GetSystemMetrics(SM_CXSCREEN) - ancho) / 2;
    const int y = (GetSystemMetrics(SM_CYSCREEN) - alto) / 2;
    HWND ventana = CreateWindowExW(WS_EX_APPWINDOW, clase.lpszClassName,
                                   estado.desinstalando           ? L"Desinstalar StartCode Panel"
                                       : estado.actualizando           ? L"Actualizar StartCode Panel"
                                       : estado.fase == Fase::Pregunta ? L"StartCode Panel"
                                                                       : L"Instalar StartCode Panel",
                                   WS_POPUP | WS_SYSMENU | WS_MINIMIZEBOX, x, y, ancho, alto, nullptr, nullptr,
                                   instancia, nullptr);
    if (!ventana)
        return 1;
    ShowWindow(ventana, SW_SHOW);
    UpdateWindow(ventana);

    MSG msg;
    while (GetMessageW(&msg, nullptr, 0, 0) > 0) {
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }

    estado.logo.reset();
    estado.familia.reset();
    estado.fuentes.reset();
    GdiplusShutdown(tokenGdi);
    return 0;
}
