#!/usr/bin/env node

function cc2human(str) {
  var output = "";
  var len = str.length;
  var char;

  for (var i=0 ; i<len ; i++) {
      char = str.charAt(i);

      if (i==0) {
          output += char.toUpperCase();
      }
      else if (char !== char.toLowerCase() && char === char.toUpperCase()) {
          output += " " + char;
      }
      else if (char == "-" || char == "_") {
          output += " ";
      }
      else {
          output += char;
      }
  }

  return output;
}

function under2cc(str) {
  return str.replace(/_([a-z])/g, function (g) { return g[1].toUpperCase(); });
}

function under2human(str) {
  return cc2human(under2cc(str));
}


// -----------------------------------------------------------
// CLI
// -----------------------------------------------------------


var mysql = require('mysql');
var argv = require('optimist')
    .usage('Generate react-admin UI\nExample: --url [mysql://user:passv@host/schema] --table [table] --schema [schema] --task [task]\nUsage: $0')
    .demand(['table', 'url', 'schema'])
    .argv

// Sanitize args
const schema = argv["schema"];
const table = argv['table'];
const url = argv['url'];
if (!schema) {
  console.log("[!] Schema is required");
  return
}
if (!table) {
  console.log("Table is required");
  return;
}
if (!url) {
  console.log("Url is required");
  return;
}

const entityName = under2cc(table);
const entityLabel = cc2human(entityName);
const entityClass = entityName.charAt(0).toUpperCase() + entityName.slice(1);


// -----------------------------------------------------------
// Process
// -----------------------------------------------------------
 
const importHeader = `
import React from 'react'
import {
  List,
  Datagrid,
  Edit,
  Show,
  Create,
  SimpleForm,
  TabbedForm,
  FormTab,
  Filter,
  TextField,
  BooleanField,
  NumberField,
  BooleanInput,
  DateField,
  EditButton,
  ShowButton,
  DisabledInput,
  TextInput,
  ReferenceInput,
  SelectInput,
  NumberInput,
  DateInput,
  TabbedShowLayout,
  Tab,
  LongTextInput,
  SelectField,
} from 'react-admin'
import {BulkActions, BulkDeleteAction} from 'react-admin';
import {required} from 'react-admin'

import RemoteAction from '../components/RemoteAction';
import RemoteMultiAction from '../components/RemoteMultiAction';
`

function getMaxFieldLen(fieldRecs) {
  var maxFieldLen = 0;
  for (var rec in fieldRecs) {
    if (maxFieldLen < fieldRecs[rec].column_name.length) {
      maxFieldLen = fieldRecs[rec].column_name.length
    }
  }
  return maxFieldLen
}

function genList(fieldRecs) {
  var fields = ''
  var maxFieldLen = getMaxFieldLen(fieldRecs);
  for (var rec in fieldRecs) {
    fields += genShowField(fieldRecs[rec], maxFieldLen, false)
  }

  return `
// Sample filter
const ${entityClass}Filter = (props) => (
    <Filter {...props}>
      <TextInput label="Code" source="code"/>
      <BooleanInput label="Active" source="active"/>
    </Filter>
);

// Sample actions
const ${entityClass}BulkActions = props => (
    <BulkActions {...props}>
      <RemoteMultiAction label="Enable" actionUrl='${entityName}/_enable'/>
      <RemoteMultiAction label="Disable" actionUrl='${entityName}/_disable'/>
      <BulkDeleteAction/>
    </BulkActions>
);

// Sample row style decorator
const rowStyle = (record, index, defaultStyle = {}) => {
  /*
  if (record.active === true)
    return {...defaultStyle, backgroundColor: '#dfd'};
  if (record.active === false)
    return {...defaultStyle, backgroundColor: '#ddd'};
  */
  return defaultStyle;
};

export const ${entityClass}List = props => (
    <List title='${entityLabel}' perPage={50} filters={<${entityClass}Filter/>} bulkActions={<${entityClass}BulkActions/>} {...props} >
      <Datagrid rowStyle={rowStyle}>
${fields}
        {/* Sample actions:
        <RemoteAction actionUrl="${entityName}/_enable" confirmTitle="Enable ${entityLabel}?">
          <EnableIcon/>
        </RemoteAction>
        */}
        <ShowButton/>
      </Datagrid>
    </List>
)
`;
}

function genChoices(fieldRecs) {
  var out = '';
  for (var rec in fieldRecs) {
    var comment = fieldRecs[rec].column_comment;
    var fieldName = under2cc(fieldRecs[rec].column_name);
    var blocks = comment.split("\n\n");
    if (blocks.length > 1) {
      var content = blocks[0]
      var entries = blocks[1].split("\n")
      var choices = ''
      for (var entry of entries) {
        var tokens = entry.split(/^(\w) - (.*)$/)
        if (tokens.length == 4) {
          if (choices.length > 0) {
            choices += "\n"
          }
          choices += `    {value: '${tokens[1]}', text: '${tokens[2]}'},`
        }
      }
      out += `
// ${content}
const _${fieldName}Choices = [
${choices}
];
`
    }
  }
  return out;
}

function genEdit(fieldRecs) {
  var fields = ''
  var maxFieldLen = getMaxFieldLen(fieldRecs);
  for (var rec in fieldRecs) {
    fields += genEditField(fieldRecs[rec], maxFieldLen)
  }

  return `
export const ${entityClass}Edit = props => (
    <Edit title="Edit ${entityLabel}" {...props}>
      <SimpleForm>
${fields}
      </SimpleForm>
    </Edit>
)
`;
}

function genShow(fieldRecs) {
  var fields = ''
  var maxFieldLen = getMaxFieldLen(fieldRecs);
  for (var rec in fieldRecs) {
    fields += genShowField(fieldRecs[rec], maxFieldLen, true)
  }

  return `
export const ${entityClass}Show = props => (
    <Show title="View ${entityLabel}" {...props}>
      <TabbedShowLayout>
      <Tab label='Details'>
${fields}
      </Tab>
      </TabbedShowLayout>
    </Show>
)
`;
}

function genShowField(rec, maxFieldLen, useCommentForLabel) {
  maxFieldLen += "source=''".length
  var result = '';
  var fieldName = under2cc(rec.column_name);
  var fieldLabel = under2human(rec.column_name);

  if (useCommentForLabel && rec.column_comment && rec.column_comment != '') {
    fieldLabel = rec.column_comment
    fieldLabel = fieldLabel.split("\n")[0]
    if (fieldLabel.endsWith(":")) {
      fieldLabel = fieldLabel.substring(0, fieldLabel.length-1)
    }
  } else {
    var id_pos = fieldLabel.indexOf(' Id');

    if (fieldLabel == 'Id') {
      fieldLabel = 'ID';
    } else if (id_pos == fieldLabel.length-2) {
      fieldLabel = fieldLabel.substring(0, id_pos);
    }
  }

  // Id is treated like an ordinary field
  if (rec.foreign_column_name && rec.foreign_column_name != '') {
    result = 
`        <ReferenceField ${("source='" + fieldName + "'").padEnd(maxFieldLen, ' ')} label='${fieldLabel}' reference='${rec.foreign_table_name}}' >
          <TextField source='${rec.foreign_column_name}'/>
        </ReferenceField>
`;
  } else if (rec.column_comment && rec.column_comment.split("\n\n").length > 1) {
    var choices = "{_" + fieldName + 'Choices}';
    result = 
`        <SelectField    ${("source='" + fieldName + "'").padEnd(maxFieldLen, ' ')} label='${fieldLabel}' choices=${choices} optionText="text" optionValue="value"/>
`
  } else {
    var type = rec.data_type;
    if (type == 'numeric' || type == 'int' || type == 'integer') {
      type = 'NumberField';
    } else if (type == 'timestamp' || type == 'datetime') {
      type = 'DateField';
    } else {
      type = 'TextField';
    }
    result = 
`        <${type.padEnd(14, ' ')} ${("source='" + fieldName + "'").padEnd(maxFieldLen, ' ')} label='${fieldLabel}'/>
`
  }
  return result;
}

function genEditField(rec, maxFieldLen) {
  maxFieldLen += "source=''".length
  var result = '';
  var fieldName = under2cc(rec.column_name);
  var fieldLabel = under2human(rec.column_name);

  if (rec.column_comment && rec.column_comment != '') {
    fieldLabel = rec.column_comment
    fieldLabel = fieldLabel.split("\n")[0]
    if (fieldLabel.endsWith(":")) {
      fieldLabel = fieldLabel.substring(0, fieldLabel.length-1)
    }
  } else {
    var id_pos = fieldLabel.indexOf(' Id');
    if (fieldLabel == 'Id') {
      fieldLabel = 'ID';
    } else if (id_pos == fieldLabel.length-2) {
      fieldLabel = fieldLabel.substring(0, id_pos);
    }
  }

  var validate = rec.is_nullable == 'NO'? ' validate={required()}' : '';
  // Id is treated like an ordinary field
  if (fieldName == 'id') {
    result = 
`        <DisabledInput  source='id'/>
`
  } else if (rec.foreign_column_name && rec.foreign_column_name != '') {
    result = 
`        <ReferenceInput ${("source='" + fieldName + "'").padEnd(maxFieldLen, ' ')} label='${fieldLabel}' reference='${rec.foreign_table_name}}${validate}' >
          <SelectInput optionText='${rec.foreign_column_name}'/>
        </ReferenceInput>
`;
  } else if (rec.column_comment && rec.column_comment.split("\n\n").length > 1) {
    // probably select
    var choices = "{_" + fieldName + 'Choices}';
    result = 
`        <SelectInput    ${("source='" + fieldName + "'").padEnd(maxFieldLen, ' ')} label='${fieldLabel}' choices=${choices} optionText='text' optionValue="value"${validate}/>
`
  } else {
    var type = rec.data_type;
    if (type == 'numeric' || type == 'int' || type == 'integer') {
      type = 'NumberInput';
    } else if (type == 'timestamp' || type == 'datetime') {
      type = 'DateInput';
    } else if (type == 'tinyint') {
      type = 'BooleanField';
    } else if (rec.character_maximum_length > 64) {
      type = 'LongTextInput';
    } else {
      type = 'TextField';
    }
    result = 
`        <${type.padEnd(14, ' ')} ${("source='" + fieldName + "'").padEnd(maxFieldLen, ' ')} label='${fieldLabel}'${validate}/>
`
  }
  return result;
}

// Fetch data
var connection = mysql.createConnection(url);
connection.connect(function(err) {
  if (err) {
    console.error('error connecting: ' + err.stack);
    return;
  }
  var sql = `
  SELECT t.column_name,
          t.column_comment,
          t.is_nullable,
          t.data_type,
          t.character_maximum_length,
          t.foreign_table_name,
          t.foreign_column_name
  FROM (
      SELECT  c.column_name,
              c.column_comment,
              c.is_nullable,
              c.data_type,
              c.character_maximum_length,              
              ccu.foreign_table_name,
              ccu.foreign_column_name,
              c.ordinal_position
      FROM    information_schema.columns c
              LEFT OUTER JOIN (
                  SELECT
                      kcu.column_name,
                      kcu.table_name,
                      kcu.referenced_table_name AS foreign_table_name,
                      kcu.referenced_column_name AS foreign_column_name
                  FROM 
                      information_schema.table_constraints AS tc
                      JOIN information_schema.key_column_usage AS kcu
                        ON tc.constraint_name = kcu.constraint_name
                  WHERE constraint_type = 'FOREIGN KEY' AND tc.table_name='${table}'
              ) ccu
              ON c.table_name = ccu.table_name AND c.column_name = ccu.column_name
      WHERE   c.table_schema = '${schema}'
      AND     c.table_name   = '${table}'
      ORDER BY c.ordinal_position ASC) t
  ORDER BY t.ordinal_position`;
  
  connection.query(sql, function (error, results, fields) {
    if (error) throw error;

    console.log(importHeader);
    console.log(genChoices(results));
    console.log(genList(results));
    console.log(genEdit(results));
    console.log(genShow(results));

    process.exit()
  });
});
