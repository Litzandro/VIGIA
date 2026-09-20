-- =====================================================================
-- 09. Guardia puede gestionar cámaras (no solo verlas)
--
-- Antes, guardia solo tenía el permiso "camaras.ver": podía mirar el
-- video pero nunca ve el botón "Agregar cámara" ni puede registrar,
-- editar o borrar una. Solo admin/superadmin podían. A pedido del
-- equipo, guardia (que suele ser quien está físicamente en garita
-- conectando o ajustando el equipo real) ahora también puede.
--
-- Este script solo AGREGA el permiso que le falta -- no toca nada de
-- lo que guardia ya podía hacer, y es seguro correrlo más de una vez
-- (no duplica la fila si ya se corrió antes).
-- =====================================================================

INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r, permisos p
WHERE r.codigo = 'guardia' AND p.codigo = 'camaras.gestionar'
  AND NOT EXISTS (
    SELECT 1 FROM roles_permisos rp WHERE rp.rol_id = r.id AND rp.permiso_id = p.id
  );

-- Verificación opcional (debería listar camaras.gestionar junto a
-- camaras.ver y el resto de permisos de guardia):
-- SELECT p.codigo FROM roles_permisos rp
-- JOIN roles r ON r.id = rp.rol_id
-- JOIN permisos p ON p.id = rp.permiso_id
-- WHERE r.codigo = 'guardia' ORDER BY p.codigo;
