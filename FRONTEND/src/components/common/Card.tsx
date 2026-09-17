import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Panel de contenido: la caja base de todas las pantallas.
 *
 * Era la misma definición copiada en Dashboard, Servidores, Notificaciones y
 * Configuración. La elevación no se escribe aquí: `.glass` la resuelve según
 * la profundidad a la que quede la tarjeta (ver App.css), así que una tarjeta
 * dentro de un panel se asienta sola.
 */
export const Card: React.FC<CardProps> = ({ children, className = '' }) => (
  <div className={`glass rounded-2xl relative grain ${className}`}>{children}</div>
);
