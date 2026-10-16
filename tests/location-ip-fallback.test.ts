import { TemplateEngine } from '../src/template';

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const rendered = new TemplateEngine().render('{{weather.tempMin}}～{{weather.tempMax}}°C', {
  weather: {
    tempMax: 31
  }
});

assert(rendered === '～31°C', 'expected missing nested template variables to render as empty text');
