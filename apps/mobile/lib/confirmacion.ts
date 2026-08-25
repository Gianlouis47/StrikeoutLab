// Confirmación antes de cualquier acción irreversible. Texto humano, botón
// destructivo, "Cancelar" primero. Patrón de
// app-movil-base/_core/components/ConfirmacionEliminar.tsx.
import { Alert } from "react-native";

export function confirmarAccion(params: {
  titulo: string;
  mensaje: string;
  tituloBotonConfirmar: string;
  onConfirmar: () => void;
}): void {
  const { titulo, mensaje, tituloBotonConfirmar, onConfirmar } = params;
  Alert.alert(titulo, mensaje, [
    { text: "Cancelar", style: "cancel" },
    { text: tituloBotonConfirmar, style: "destructive", onPress: onConfirmar },
  ]);
}
