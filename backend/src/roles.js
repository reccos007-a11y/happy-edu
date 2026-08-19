// Источник правды по правам: проверки доступа и то, что отдаётся фронтенду,
// собираются отсюда, поэтому новое право достаточно добавить в PERMISSIONS.
//
// Новая роль — исключение: её нужно добавить и сюда, и в новую миграцию,
// потому что список ролей закреплён CHECK-ограничением в БД.

export const PERMISSIONS = {
  USERS_READ: 'users:read',
  USERS_WRITE: 'users:write',
  ROLES_MANAGE: 'roles:manage',
  CONTENT_WRITE: 'content:write',
};

const ALL_PERMISSIONS = Object.values(PERMISSIONS);

export const ROLES = {
  user: [],
  // Ученик: собственных административных прав нет; доступ к своему кабинету и
  // учебному плану определяется принадлежностью данных, а не правами из этого
  // списка. Заводит ученика администратор (users:write) в разделе «Ученики».
  student: [],
  // Максимальный набор: администратор получает все существующие права, включая
  // те, что появятся позже в PERMISSIONS.
  admin: ALL_PERMISSIONS,
};

export const ROLE_NAMES = Object.keys(ROLES);
export const DEFAULT_ROLE = 'user';
export const ADMIN_ROLE = 'admin';
export const STUDENT_ROLE = 'student';

export function permissionsOf(role) {
  return ROLES[role] ?? [];
}

export function hasPermission(role, permission) {
  return permissionsOf(role).includes(permission);
}

export function isValidRole(role) {
  return Object.hasOwn(ROLES, role);
}
