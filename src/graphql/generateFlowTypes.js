// @flow

import prettier, {type Options as PrettierOptions} from "prettier";

import type {
  ConnectionFieldType,
  FieldType,
  IdFieldType,
  NestedFieldType,
  NodeFieldType,
  PrimitiveFieldType,
  Schema,
} from "./schema";

export default function generateFlowTypes(
  schema: Schema,
  prettierOptions: PrettierOptions
): string {
  const definitions = [];

  function formatField(field: FieldType): string {
    switch (field.type) {
      case "ID":
        return formatIdField(field);
      case "PRIMITIVE":
        return formatPrimitiveField(field);
      case "NODE":
        return formatNodeField(field);
      case "CONNECTION":
        return formatConnectionField(field);
      case "NESTED":
        return formatNestedField(field);
      // istanbul ignore next: unreachable per Flow
      default:
        throw new Error((field.type: empty));
    }
  }
  function formatIdField(_unused_field: IdFieldType): string {
    return "string";
  }
  function formatPrimitiveField(field: PrimitiveFieldType): string {
    if (field.annotation == null) {
      return "mixed";
    } else if (field.annotation.nonNull) {
      return field.annotation.elementType;
    } else {
      return "null | " + field.annotation.elementType;
    }
  }
  function formatNodeField(field: NodeFieldType): string {
    if (field.fidelity.type === "UNFAITHFUL") {
      throw new Error("Unfaithful Fidelity not yet supported");
    }
    return "null | " + field.elementType;
  }
  function formatConnectionField(field: ConnectionFieldType): string {
    return `$ReadOnlyArray<null | ${field.elementType}>`;
  }
  function formatNestedField(field: NestedFieldType): string {
    const eggs = [];
    for (const eggName of Object.keys(field.eggs).sort()) {
      eggs.push({eggName, rhs: formatField(field.eggs[eggName])});
    }
    const eggContents = eggs.map((x) => `+${x.eggName}: ${x.rhs}`).join(", ");
    return `null | {|\n${eggContents}\n|}`;
  }

  for (const typename of Object.keys(schema).sort()) {
    const type = schema[typename];
    switch (type.type) {
      case "SCALAR":
        definitions.push(`export type ${typename} = ${type.representation};`);
        break;
      case "ENUM": {
        const values = Object.keys(type.values)
          .sort()
          .map((x) => JSON.stringify(x));

        // export type E = "A" | "B";
        const typeRhs = values.length === 0 ? "empty" : values.join(" | ");
        definitions.push(`export type ${typename} = ${typeRhs};`);

        // export const E$Values: {|+A: "A", +B: "B"|} = Object.freeze(...);
        const objectName = `${typename}$Values`;
        const objectType = [
          "{|",
          values.map((x) => `+${x}: ${x}`).join(", "),
          "|}",
        ].join("");
        const objectValue = [
          "Object.freeze({",
          values.map((x) => `${x}: ${x}`).join(", "),
          "})",
        ].join("");
        definitions.push(
          `export const ${objectName}: ${objectType} = ${objectValue};`
        );
        break;
      }
      case "OBJECT": {
        const fields = [
          {fieldname: "__typename", rhs: JSON.stringify(typename)},
        ];
        for (const fieldname of Object.keys(type.fields).sort()) {
          fields.push({fieldname, rhs: formatField(type.fields[fieldname])});
        }
        const fieldContents = fields
          .map((x) => `+${x.fieldname}: ${x.rhs}`)
          .join(", ");
        const rhs = `{|\n${fieldContents}\n|}`;
        definitions.push(`export type ${typename} = ${rhs};`);
        break;
      }
      case "UNION": {
        const rhs =
          Object.keys(type.clauses).length === 0
            ? "empty"
            : Object.keys(type.clauses)
                .sort()
                .join(" | ");
        definitions.push(`export type ${typename} = ${rhs};`);
        break;
      }
      // istanbul ignore next: unreachable per Flow
      default:
        throw new Error((type.type: empty));
    }
  }

  const rawSource = [
    "// @flow",
    "// Autogenerated file. Do not edit.",
    ...definitions,
  ].join("\n\n");
  return prettier.format(rawSource, prettierOptions);
}
